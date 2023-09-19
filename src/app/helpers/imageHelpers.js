// Encoding an image is also done by sticking pixels in an
// HTML canvas and by asking the canvas to serialize it into
// an actual PNG file via canvas.toBlob().
export async function encode(canvas, ctx, imageData) {
  ctx.putImageData(imageData, 0, 0);
  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result));
      reader.onerror = () => reject(new Error('Could not read from blob'));
      reader.readAsArrayBuffer(blob);
    });
  });
}

// Decoding an image can be done by sticking it in an HTML
// canvas, as we can read individual pixels off the canvas.
export async function decode(canvas, ctx, bytes) {
  const url = URL.createObjectURL(new Blob([bytes]));
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject();
    img.src = url;
  });
  canvas.width = image.width;
  canvas.height = image.height;
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, image.width, image.height);
  return imageData;
}

export function getMimeTypeFromArrayBuffer(arrayBuffer) {
  const uint8arr = new Uint8Array(arrayBuffer)

  const len = 4
  if (uint8arr.length >= len) {
    let signatureArr = new Array(len)
    for (let i = 0; i < len; i++)
      signatureArr[i] = (new Uint8Array(arrayBuffer))[i].toString(16)
    const signature = signatureArr.join('').toUpperCase()

    switch (signature) {
      case '89504E47':
        return 'image/png'
      case '47494638':
        return 'image/gif'
      case '25504446':
        return 'application/pdf'
      case 'FFD8FFDB':
      case 'FFD8FFE0':
        return 'image/jpeg'
      case '504B0304':
        return 'application/zip'
      default:
        return null
    }
  }
  return null
}
