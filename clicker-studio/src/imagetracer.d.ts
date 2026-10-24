declare module "imagetracerjs" {
  const ImageTracer: {
    imagedataToTracedata(imgd: { width: number; height: number; data: Uint8ClampedArray }, options: object): {
      layers: { isholepath: boolean }[][];
      palette: object[];
      width: number;
      height: number;
    };
    svgpathstring(td: object, layer: number, path: number, options: object): string;
    checkoptions(options: object): object;
  };
  export default ImageTracer;
}
