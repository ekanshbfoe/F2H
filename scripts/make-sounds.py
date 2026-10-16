"""
Synthesises the PIN screen sounds into assets/sounds/ (16 bit mono WAV, 44.1 kHz).

    python scripts/make-sounds.py

Both are made from scratch here (no samples, nothing licensed):

- key.wav: a soft, short "tock" for each key press. A damped low tone gives it body, a 2 ms
  burst of filtered noise gives it the click of a real key. About 45 ms.
- unlock.wav: the right PIN. An airy swell rises while the boxes glow, then a glassy bell
  arpeggio lands as they stack into one, timed to the success animation (the bells start at
  300 ms, when the boxes meet). About 1.2 s.
"""

import os
import wave

import numpy as np

RATE = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sounds')
rng = np.random.default_rng(7)


def t(seconds):
    return np.arange(int(seconds * RATE)) / RATE


def lowpass(x, cutoff):
    # one pole low pass, enough to round off noise
    a = np.exp(-2 * np.pi * cutoff / RATE)
    y = np.zeros_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def place(buf, sound, at):
    start = int(at * RATE)
    end = min(len(buf), start + len(sound))
    buf[start:end] += sound[: end - start]


def fade_edges(x, ms=3):
    n = int(RATE * ms / 1000)
    x[:n] *= np.linspace(0, 1, n)
    x[-n:] *= np.linspace(1, 0, n)
    return x


def write(name, x, peak_db):
    x = x / np.max(np.abs(x)) * (10 ** (peak_db / 20))
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    os.makedirs(OUT, exist_ok=True)
    with wave.open(os.path.join(OUT, name), 'wb') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes(pcm.tobytes())
    print(name, f'{len(x) / RATE * 1000:.0f} ms')


def key():
    s = t(0.045)
    body = np.sin(2 * np.pi * 540 * s) * np.exp(-s / 0.007)
    ping = 0.25 * np.sin(2 * np.pi * 2300 * s) * np.exp(-s / 0.003)
    click = highpass(rng.standard_normal(len(s)), 1800) * np.exp(-s / 0.0012) * 0.35
    return fade_edges(body + ping + click)


def bell(freq, length, decay):
    # an inharmonic glass bell: the partials of a struck bar, the high ones dying first
    s = t(length)
    out = np.zeros_like(s)
    for ratio, gain, tau in ((1.0, 1.0, decay), (2.76, 0.35, decay / 2.2), (5.4, 0.12, decay / 4)):
        out += gain * np.sin(2 * np.pi * freq * ratio * s) * np.exp(-s / tau)
    attack = int(0.004 * RATE)
    out[:attack] *= np.linspace(0, 1, attack)
    return out


def unlock():
    total = 1.2
    buf = np.zeros(int(total * RATE))

    # the swell: soft high noise breathing in under the glow, then easing out
    s = t(total)
    env = np.minimum(s / 0.22, 1) ** 2 * np.exp(-np.maximum(s - 0.22, 0) / 0.32)
    air = highpass(lowpass(rng.standard_normal(len(s)), 9000), 2500) * env * 0.10
    buf += air

    # the landing: a low, soft thump as the boxes stack
    thump_t = t(0.09)
    thump = np.sin(2 * np.pi * 150 * thump_t) * np.exp(-thump_t / 0.025) * 0.55
    place(buf, thump, 0.31)

    # the chime: a quick rising arpeggio (E6, G#6, B6, E7), each note a beat after the last
    for i, f in enumerate((1318.5, 1661.2, 1975.5, 2637.0)):
        place(buf, bell(f, 0.9, 0.30 - i * 0.03) * (0.55 - i * 0.07), 0.30 + i * 0.055)

    return fade_edges(buf, 8)


if __name__ == '__main__':
    write('key.wav', key(), -9)
    write('unlock.wav', unlock(), -6)
