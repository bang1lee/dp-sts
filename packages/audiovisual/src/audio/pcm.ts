export function prepareMaster(
  channels: Float32Array[],
  sampleRate: number,
  fadeSeconds: number,
): Float32Array[] {
  if (
    !channels.length ||
    !channels[0].length ||
    channels.some((c) => c.length !== channels[0].length)
  )
    throw new Error('Invalid PCM channel lengths');
  let peak = 0;
  for (const channel of channels)
    for (const sample of channel) {
      if (!Number.isFinite(sample))
        throw new Error('PCM samples must be finite');
      peak = Math.max(peak, Math.abs(sample));
    }
  const scale = peak > 0.95 ? 0.95 / peak : 1,
    fade = Math.round(fadeSeconds * sampleRate),
    length = channels[0].length;
  return channels.map((channel) =>
    Float32Array.from(channel, (sample, i) => {
      const envelope =
        fade > 0 ? Math.min(1, i / fade, (length - 1 - i) / fade) : 1;
      return Math.round(sample * scale * envelope * 32767) / 32768 || 0;
    }),
  );
}
export function encodeWav(
  channels: Float32Array[],
  sampleRate: number,
): Uint8Array {
  const frames = channels[0].length,
    count = channels.length;
  const buffer = new ArrayBuffer(44 + frames * count * 2),
    view = new DataView(buffer);
  const word = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(offset + i, value.charCodeAt(i));
  };
  word(0, 'RIFF');
  view.setUint32(4, buffer.byteLength - 8, true);
  word(8, 'WAVE');
  word(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  word(36, 'data');
  view.setUint32(40, frames * count * 2, true);
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < count; c++)
      view.setInt16(
        44 + (i * count + c) * 2,
        Math.max(-32768, Math.min(32767, Math.round(channels[c][i] * 32768))),
        true,
      );
  return new Uint8Array(buffer);
}
