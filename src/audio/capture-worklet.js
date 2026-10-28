// AudioWorklet that forwards the input signal to the main thread in fixed hops.
// Plain JS on purpose: it is loaded by URL into the audio rendering thread.

const HOP = 512;

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(HOP);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      let read = 0;
      while (read < channel.length) {
        const take = Math.min(HOP - this.filled, channel.length - read);
        this.buffer.set(channel.subarray(read, read + take), this.filled);
        this.filled += take;
        read += take;
        if (this.filled === HOP) {
          this.port.postMessage(this.buffer, [this.buffer.buffer]);
          this.buffer = new Float32Array(HOP);
          this.filled = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('hts-capture', CaptureProcessor);
