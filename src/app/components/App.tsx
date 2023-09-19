import React, { useEffect, useState } from 'react';
import '../styles/ui.css';

function App() {
  const [imageMap, setImageMap] = useState(null);
  const [scanningSelection, setScanningSelection] = useState(false);
  const canvasRef = React.useRef(null);
  const [canvasWidth, setCanvasWidth] = useState(100);
  const [canvasHeight, setCanvasHeight] = useState(100);
  const [selectionDirty, setSelectionDirty] = useState(false);
  const [quality, setQuality] = useState(30);
  const [qualityString, setQualityString] = useState('Average');
  const [resizeToFit, setResizeToFit] = useState(true);

  const onCompress = () => {
    parent.postMessage({ pluginMessage: { type: 'start-compress', imageMap } }, '*');
  };

  const onScan = () => {
    setScanningSelection(true);
    setSelectionDirty(false);
    setTimeout(() => {
      parent.postMessage({ pluginMessage: { type: 'start-scan' } }, '*');
    }, 250);
  };

  const compressImage = async (nodeList, bytes) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    let url = null;
    let image = null;

    for (let i = 0; i < nodeList.length; i++) {
      const node = nodeList[i];
      // TODO: Scale this up by 2x?
      const height = node.height;
      const width = node.width;
      const targetHash = node.targetHash;

      for (let j = 0; j < node.fills.length; j++) {
        if (node.fills[j].imageHash !== targetHash) {
          continue;
        }
        if (url === null) {
          url = URL.createObjectURL(new Blob([bytes]));
        }
        if (image === null) {
          image = (await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject();
            img.src = url;
          })) as HTMLImageElement;
        }

        // Set canvas size based on fill type and image size
        const fill = node.fills[j];
        const nodeRatio = height / width;
        const imageRatio = image.height / image.width;
        let scaleWidth = null;
        let scaleHeight = null;

        if (resizeToFit) {
          switch (fill.scaleMode) {
            case 'FILL':
              // Smaller image dimension scales to larger layer dimension
              if (nodeRatio < imageRatio) {
                // Image is longer than the layer, Image width will scale to fill layer width
                if (width >= image.width) {
                  // Layer is already bigger than the image, we shouldn't scale it down more
                } else {
                  scaleWidth = width;
                  scaleHeight = imageRatio * width;
                }
              } else if (nodeRatio > imageRatio) {
                // Image is wider than the layer, image height will scale to fill layer height
                if (height >= image.height) {
                  // Layer is already bigger than the image, we shouldn't scale it down more
                } else {
                  scaleWidth = height / imageRatio;
                  scaleHeight = height;
                }
              } else {
                // Image and node are the same aspect ratio, only scale image if it's larger than node
                if (image.height > height && image.width > width) {
                  scaleWidth = width;
                  scaleHeight = height;
                }
              }
              break;
            case 'FIT':
              // Larger image dimension scales to smaller layer dimension
              if (nodeRatio < imageRatio) {
                // Image is longer than the layer, image height will scale to fit layer height
                if (height >= image.height) {
                  // Layer is already longer than the image, we shouldn't scale it down more
                } else {
                  scaleWidth = height / imageRatio;
                  scaleHeight = height;
                }
              } else if (nodeRatio > imageRatio) {
                // Image is wider than the layer, image width will scale to fit layer width
                if (width >= image.width) {
                  // Layer is already bigger than the image, we shouldn't scale it down more
                } else {
                  scaleWidth = width;
                  scaleHeight = imageRatio * width;
                }
              } else {
                // Image and node are the same aspect ratio, only scale image if it's larger than node
                if (image.height > height && image.width > width) {
                  scaleWidth = width;
                  scaleHeight = height;
                }
              }
            // TODO: Adjust for crop as well
            default:
              break;
          }
        }

        // TODO: We should change draw origin based on fit/fill/crop
        if (scaleHeight !== null) {
          console.log('Scaling image from ', image.width, image.height);
          console.log('To ', scaleWidth, scaleHeight);
          ctx.canvas.width = scaleWidth;
          ctx.canvas.height = scaleHeight;
          setCanvasWidth(scaleWidth);
          setCanvasHeight(scaleHeight);
          ctx.drawImage(image, 0, 0, scaleWidth, scaleHeight);
          // Get blob from newly drawn canvas, reduce quality too if needed
          // const imageData = ctx.getImageData(0, 0, scaleWidth, scaleHeight);
          const mimeType = image.mimeType;
          // TODO: Quality slider?
          await canvas.toBlob(
            async function (blob) {
              // Blob to uint8array
              const arrayBuffer = await blob.arrayBuffer();

              parent.postMessage(
                {
                  pluginMessage: {
                    type: 'set-fill',
                    nodeID: node.id,
                    fillIndex: j,
                    bytes: arrayBuffer,
                  },
                },
                '*'
              );

              // Blob to base64
              // var reader = new FileReader();
              // reader.readAsDataURL(blob);
              // reader.onloadend = function () {
              //   var base64data = reader.result;
              //   console.log(base64data);
              // };
            },
            mimeType,
            quality
          );
        }
      }
    }
  };

  React.useEffect(() => {
    // This is how we read messages sent from the plugin controller
    window.onmessage = (event) => {
      const { type, message } = event.data.pluginMessage;
      if (type === 'compress-images') {
        console.log(`Figma Says: ${message}`);
      } else if (type === 'selected-images') {
        setImageMap(message);
        setScanningSelection(false);
        setSelectionDirty(false);
      } else if (type === 'start-selection') {
        setSelectionDirty(true);
      } else if (type === 'compress-image') {
        compressImage(message.nodeList, message.bytes);
      }
    };
  }, []);

  useEffect(() => {
    if (quality < 20) {
      setQualityString('Low');
    } else if (quality < 50) {
      setQualityString('Average');
    } else if (quality < 80) {
      setQualityString('High');
    } else {
      setQualityString('Very high');
    }
  }, [quality]);

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        style={{ left: '100%', position: 'absolute' }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'start' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            width: '100%',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <label htmlFor="quality" style={{ marginLeft: 6, fontWeight: 'bold' }}>
            Compression quality
          </label>
          <div style={{ textAlign: 'end' }}>{qualityString}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'row', width: '100%' }}>
          <input
            type="range"
            min="1"
            max="100"
            value={quality}
            id="quality"
            style={{ backgroundColor: 'red', width: '100%' }}
            onChange={(e) => {
              setQuality(parseInt(e.target.value));
            }}
          />
          <p style={{ width: 30 }}>{quality}</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
        <input
          id="resize"
          type="checkbox"
          checked={resizeToFit}
          onChange={(e) => {
            setResizeToFit(!resizeToFit);
          }}
        ></input>
        <label htmlFor="resize" style={{ marginLeft: 6, fontWeight: 'bold' }}>
          Resize images to fit container
        </label>
      </div>
      <div style={{ textAlign: 'start', marginLeft: 6, marginTop: 8 }}>
        If image fills are larger than the object they're applied to, the plugin will resize the images down to fit the
        container.
      </div>

      <p style={{ textAlign: 'start', marginLeft: 6, color: '#d17b26', marginTop: 32 }}>
        {selectionDirty ? 'Warning: Current selection is unscanned' : '\u00A0'}
      </p>
      <p style={{ textAlign: 'start', marginLeft: 6 }}>
        Images in selection: {imageMap ? Object.keys(imageMap).length : 0}
      </p>
      <div style={{ display: 'flex', flexDirection: 'row' }}>
        <button onClick={onScan}>{scanningSelection ? 'Scanning...' : 'Scan selection'}</button>

        <button
          id="compress"
          onClick={onCompress}
          disabled={scanningSelection || !imageMap || Object.keys(imageMap).length <= 0 || selectionDirty}
        >
          Compress images
        </button>
      </div>
    </div>
  );
}

export default App;
