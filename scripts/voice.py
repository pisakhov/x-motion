#!/usr/bin/env python3
"""Narration track for an X Motion long film: local text-to-speech, placed on the film's timeline.

Usage:
  python scripts/voice.py examples/orbit/voice/one-orbit.json            # synthesize
  python scripts/voice.py examples/orbit/voice/one-orbit.json --check    # transcribe a file and compare

Input (authored) is a JSON script:
  {"voice": "af_heart", "lang": "en-us", "speed": 0.92, "duration": 60,
   "lines": [{"at": 4.0, "text": "Every orbit begins with a door."}, ...]}
"at" is the line's start on the film timeline in seconds.

Output, next to the script (same stem):
  NAME.flac       48 kHz mono 24-bit: every line, trimmed and level-matched, at its start time
  NAME.cues.json  measured start/end per line, plus model, voice and package provenance
  NAME.vtt        WebVTT captions with the same timing

Voice: Kokoro-82M (Apache-2.0) through kokoro-onnx (MIT), run locally on CPU. No network calls.
Models (verified by SHA-256 before use), from
https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0 :
  kokoro-v1.0.onnx, voices-v1.0.bin   in $X_MOTION_TTS_MODELS (default ~/.local/share/x-motion-tts/models)
Environment (Python 3.12):
  uv venv --python 3.12 VENV && uv pip install --python VENV/bin/python \
    kokoro-onnx==0.6.1 onnxruntime==1.31.1 numpy==2.5.4 soundfile==0.14.0 [faster-whisper==1.2.1 for --check]
--check decodes with ffmpeg (16 kHz mono) and transcribes with faster-whisper base.en; it accepts any WAV,
FLAC or MP4 (for example the rendered film) via --audio FILE, and reports word accuracy against the script.
"""
import hashlib
import json
import math
import os
import re
import subprocess
import sys
from importlib.metadata import version
from pathlib import Path

import numpy as np

SR = 48000
MODELS = Path(os.environ.get('X_MOTION_TTS_MODELS', Path.home() / '.local/share/x-motion-tts/models'))
SHA = {
    'kokoro-v1.0.onnx': '7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5',
    'voices-v1.0.bin': 'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d',
}
LINE_LUFS = -20.0      # every line lands at the same integrated loudness
MIN_GAP = 0.30         # seconds of silence required between consecutive lines


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def biquad(x, b, a):
    """Direct-form I biquad (a[0] == 1), float64, deterministic."""
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    b0, b1, b2 = b
    _, a1, a2 = a
    for i in range(len(x)):
        x0 = x[i]
        y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, x0, y1, y0
        y[i] = y0
    return y


def rbj(kind, f0, q, sr, gain_db=0.0):
    w = 2 * math.pi * f0 / sr
    al, cw = math.sin(w) / (2 * q), math.cos(w)
    if kind == 'highpass':
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
        a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'peak':
        A = 10 ** (gain_db / 40)
        b = [1 + al * A, -2 * cw, 1 - al * A]
        a = [1 + al / A, -2 * cw, 1 - al / A]
    else:
        raise ValueError(kind)
    return [v / a[0] for v in b], [1.0, a[1] / a[0], a[2] / a[0]]


def lufs(x, sr):
    """BS.1770-4 integrated loudness of a mono signal (gated)."""
    # K-weighting: high shelf then high-pass (coefficients recomputed for sr)
    K = math.tan(math.pi * 1681.974450955533 / sr)
    Q = 0.7071752369554196
    Vh = 10 ** (3.999843853973347 / 20)
    Vb = Vh ** 0.4996667741545416
    a0 = 1 + K / Q + K * K
    s = biquad(x, [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0],
               [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0])
    K = math.tan(math.pi * 38.13547087602444 / sr)
    Q = 0.5003270373238773
    a0 = 1 + K / Q + K * K
    s = biquad(s, [1, -2, 1], [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0])
    block, step = int(0.4 * sr), int(0.1 * sr)
    z = np.array([np.mean(s[i:i + block] ** 2) for i in range(0, len(s) - block + 1, step)])
    z = z[z > 0]
    L = lambda v: -0.691 + 10 * np.log10(v)
    z = z[L(z) > -70]
    if not len(z):
        return -math.inf
    rel = L(z.mean()) - 10
    return float(L(z[L(z) > rel].mean()))


def upsample2(x):
    """24 kHz -> 48 kHz: zero-stuff and a Kaiser-windowed sinc low-pass at 10 kHz (linear phase).
    The cutoff sits below the 12 kHz model bandwidth: Kokoro occasionally emits sample-rate-alternating
    spikes (a vocoder artifact near Nyquist) that would otherwise pass through as clicks."""
    taps = 255
    n = np.arange(taps) - (taps - 1) / 2
    fc = 10000 / SR
    h = 2 * fc * np.sinc(2 * fc * n) * np.kaiser(taps, 9.0)
    h *= 2 / h.sum()                       # unity passband gain after zero-stuffing
    y = np.zeros(len(x) * 2)
    y[::2] = x
    return np.convolve(y, h)[(taps - 1) // 2:(taps - 1) // 2 + len(y)]


def trim(x, sr, floor_db=-48.0, pad=0.02):
    env = np.convolve(np.abs(x), np.ones(int(0.005 * sr)) / int(0.005 * sr), mode='same')
    on = np.flatnonzero(env > 10 ** (floor_db / 20) * np.max(np.abs(x)))
    if not len(on):
        raise SystemExit('Synthesis produced silence')
    a, b = max(0, on[0] - int(pad * sr)), min(len(x), on[-1] + int(pad * sr))
    return x[a:b]


def level(x, sr, threshold_db=-17.0, ratio=3.0, attack=0.004, release=0.12):
    """Feed-forward peak compressor (narration crest-factor control), soft 6 dB knee."""
    ca, cr = math.exp(-1 / (attack * sr)), math.exp(-1 / (release * sr))
    env, out = 0.0, np.empty_like(x)
    for i, v in enumerate(x):
        a = abs(v)
        env = ca * env + (1 - ca) * a if a > env else cr * env + (1 - cr) * a
        over = 20 * math.log10(env + 1e-12) - threshold_db
        red = over * (1 - 1 / ratio) if over > 3 else (1 - 1 / ratio) * (over + 3) ** 2 / 12 if over > -3 else 0.0
        out[i] = v * 10 ** (-red / 20)
    return out


def limit(x, sr, ceiling_db=-2.0, lookahead=0.005, release=0.08):
    """Lookahead peak limiter: never exceeds the ceiling, gain changes are smoothed (no clipping)."""
    ceiling, n = 10 ** (ceiling_db / 20), int(lookahead * sr)
    need = np.minimum(1.0, ceiling / np.maximum(np.abs(x), 1e-12))
    padded = np.concatenate([need, np.ones(n)])
    ahead = np.lib.stride_tricks.sliding_window_view(padded, n + 1).min(axis=1)[:len(x)]
    box = np.convolve(np.concatenate([np.ones(n), ahead]), np.ones(n) / n, mode='valid')[:len(x)]
    target = np.minimum(box, ahead)
    rel, g, out = 1 - math.exp(-1 / (release * sr)), 1.0, np.empty_like(x)
    for i in range(len(x)):
        g = target[i] if target[i] < g else g + (target[i] - g) * rel
        out[i] = x[i] * g
    return out


def fade(x, sr, inn=0.004, out=0.03):
    i, o = int(inn * sr), int(out * sr)
    x[:i] *= np.linspace(0, 1, i)
    x[-o:] *= np.linspace(1, 0, o) ** 2
    return x


def vtt_time(t):
    ms = round(t * 1000)
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d}.{ms % 1000:03d}'


def wrap(text, width=44):
    words, rows, row = text.split(), [], ''
    for w in words:
        if row and len(row) + 1 + len(w) > width:
            rows.append(row)
            row = w
        else:
            row = f'{row} {w}'.strip()
    rows.append(row)
    if len(rows) > 2:
        raise SystemExit(f'Caption needs more than two rows; split the line: {text}')
    return '\n'.join(rows)


def synthesize(script_path):
    import soundfile as sf
    from kokoro_onnx import Kokoro

    script = json.loads(Path(script_path).read_text())
    for name, digest in SHA.items():
        if sha256(MODELS / name) != digest:
            raise SystemExit(f'{name}: SHA-256 mismatch or missing in {MODELS}')
    kokoro = Kokoro(str(MODELS / 'kokoro-v1.0.onnx'), str(MODELS / 'voices-v1.0.bin'))
    duration, lines = script['duration'], script['lines']
    track = np.zeros(int(round(duration * SR)))
    hp_b, hp_a = rbj('highpass', 75, 0.7, SR)
    pr_b, pr_a = rbj('peak', 3200, 1.0, SR, 1.5)    # a little presence for small speakers
    cues = []
    for index, line in enumerate(lines):
        speed = line.get('speed', script.get('speed', 1.0))
        samples, rate = kokoro.create(line['text'], voice=script['voice'], speed=speed, lang=script['lang'],
                                      sentence_pause=script.get('sentencePause', 0.42),
                                      clause_pause=script.get('clausePause', 0.16))
        if rate != 24000:
            raise SystemExit(f'Unexpected Kokoro sample rate {rate}')
        x = upsample2(trim(np.asarray(samples, dtype=np.float64), rate))
        x = biquad(biquad(x, hp_b, hp_a), pr_b, pr_a)
        x *= 10 ** ((LINE_LUFS - lufs(x, SR)) / 20)
        x = level(x, SR)
        x *= 10 ** ((LINE_LUFS - lufs(x, SR)) / 20)
        x = fade(limit(x, SR), SR)
        start = int(round(line['at'] * SR))
        end = start + len(x)
        if end > len(track):
            raise SystemExit(f'Line {index + 1} ends at {end / SR:.2f}s, after the film ({duration}s)')
        if index + 1 < len(lines) and end / SR + MIN_GAP > lines[index + 1]['at']:
            raise SystemExit(f'Line {index + 1} ends at {end / SR:.2f}s; line {index + 2} starts at {lines[index + 1]["at"]}s')
        track[start:end] += x
        cues.append({'start': round(start / SR, 4), 'end': round(end / SR, 4), 'text': line['text']})
        print(f'{index + 1:2d}  {start / SR:6.2f}-{end / SR:6.2f}  ({len(x) / SR:4.2f}s)  {line["text"]}')
    peak = float(np.max(np.abs(track)))
    if peak > 0.80:
        raise SystemExit(f'Voice track peaks at {20 * math.log10(peak):.1f} dBFS (limit -2 dBFS); lower LINE_LUFS')
    base = Path(script_path).with_suffix('')
    sf.write(f'{base}.flac', track.astype(np.float32), SR, subtype='PCM_24', format='FLAC')
    meta = {
        'sampleRate': SR, 'duration': duration, 'lineLufs': LINE_LUFS, 'peakDbfs': round(20 * math.log10(peak), 2),
        'voice': script['voice'], 'lang': script['lang'],
        'model': 'Kokoro-82M v1.0 (Apache-2.0) via kokoro-onnx (MIT)',
        'files': {name: digest for name, digest in SHA.items()},
        'packages': {p: version(p) for p in ['kokoro-onnx', 'onnxruntime', 'numpy', 'soundfile']},
        'audioSha256': sha256(f'{base}.flac'),
        'lines': cues,
    }
    Path(f'{base}.cues.json').write_text(json.dumps(meta, indent=2) + '\n')
    vtt = ['WEBVTT', '']
    for i, cue in enumerate(cues):
        until = min(cue['end'] + 0.35, cues[i + 1]['start'] if i + 1 < len(cues) else duration)
        vtt += [str(i + 1), f'{vtt_time(cue["start"])} --> {vtt_time(until)}', wrap(cue['text']), '']
    Path(f'{base}.vtt').write_text('\n'.join(vtt))
    print(f'Wrote {base}.flac ({peak and 20 * math.log10(peak):.1f} dBFS peak), .cues.json, .vtt')


ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split()
TENS = 'twenty thirty forty fifty sixty seventy eighty ninety'.split()


def spell(number):
    n = int(number)
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10 - 2] + ('' if n % 10 == 0 else ' ' + ONES[n % 10])
    return number


def words(text):
    """Lower case, apostrophes dropped (its/it's), numerals spelled out (90 -> ninety)."""
    text = re.sub(r"['’]", '', text.lower())
    text = re.sub(r'\d+', lambda m: spell(m.group()), text)
    return re.findall(r'[a-z]+', text)


def distance(ref, hyp):
    d = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        prev, d[0] = d[0], i
        for j, h in enumerate(hyp, 1):
            prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (r != h))
    return d[-1]


def check(script_path, audio=None):
    from faster_whisper import WhisperModel

    script = json.loads(Path(script_path).read_text())
    audio = audio or f'{Path(script_path).with_suffix("")}.flac'
    raw = subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-i', audio, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    model = WhisperModel('base.en', device='cpu', compute_type='int8')
    segments, _ = model.transcribe(np.frombuffer(raw, np.float32), beam_size=5, word_timestamps=True,
                                   vad_filter=True, condition_on_previous_text=False)
    heard = []
    for seg in segments:
        print(f'  {seg.start:6.2f}-{seg.end:6.2f}  {seg.text.strip()}')
        heard += [(w.start, w.word) for w in seg.words]
    ref = [w for line in script['lines'] for w in words(line['text'])]
    hyp = [w for _, word in heard for w in words(word)]
    errors = distance(ref, hyp)
    chars = distance(list(''.join(ref)), list(''.join(hyp)))
    print(f'Word error rate {errors}/{len(ref)} = {errors / len(ref):.1%}; letter error rate {chars / len(''.join(ref)):.1%} ({audio})')
    return errors / len(ref)


if __name__ == '__main__':
    args = sys.argv[1:]
    if not args or args[0].startswith('-'):
        raise SystemExit(__doc__)
    if '--check' in args:
        audio = args[args.index('--audio') + 1] if '--audio' in args else None
        check(args[0], audio)
    else:
        synthesize(args[0])
