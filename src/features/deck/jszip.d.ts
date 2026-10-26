import 'jszip';

declare module 'jszip' {
  interface JSZipObject {
    /** Documented JSZip API missing from the package's bundled declarations. */
    internalStream(type: 'uint8array'): JSZipStreamHelper<Uint8Array>;
  }
}
