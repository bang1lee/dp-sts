declare module '@strudel/web' {
  interface Pattern {
    slow(value: number): Pattern;
    s(value: string): Pattern;
    gain(value: number): Pattern;
    attack(value: number): Pattern;
    release(value: number): Pattern;
    lpf(value: number): Pattern;
    pan(value: number): Pattern;
    seed(value: number): Pattern;
    queryArc(
      begin: number,
      end: number,
      controls?: object,
    ): Array<{
      value: Record<string, unknown>;
      whole: { begin: { valueOf(): number } };
      duration: number;
      hasOnset(): boolean;
    }>;
    play(): Pattern;
  }
  export function initStrudel(): Promise<unknown>;
  export function note(value: string): Pattern;
  export function hush(): void;
  export function getAudioContext(): AudioContext;
  export function stack(...patterns: Pattern[]): Pattern;
  export function setAudioContext(context: BaseAudioContext | null): void;
  export function getSuperdoughAudioController(): {
    getOrbit(
      index: number,
      channels: number[],
    ): { connectToOutput(node: AudioNode): void };
  };
  export function setSuperdoughAudioController(controller: null): void;
  export function initAudio(options?: { maxPolyphony: number }): Promise<void>;
  export function superdough(
    value: Record<string, unknown>,
    time: number,
    duration: number,
    cps: number,
    begin: number,
  ): Promise<unknown>;
}
