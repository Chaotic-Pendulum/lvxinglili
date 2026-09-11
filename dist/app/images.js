const cache = new Map();
export function loadDecodedImage(url) {
  const existing = cache.get(url);
  if (existing) return existing;
  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = async () => {
      try {
        if (image.decode) await image.decode();
        resolve(image);
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () =>
      reject(
        new Error("图片加载失败：" + new URL(url, location.href).pathname),
      );
    image.src = url;
  });
  cache.set(url, promise);
  promise.catch(() => cache.delete(url));
  if (cache.size > 32) cache.delete(cache.keys().next().value);
  return promise;
}
