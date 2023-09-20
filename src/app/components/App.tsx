import React, { useCallback, useEffect, useState } from 'react';
import '../styles/ui.css';
import { getMimeTypeFromArrayBuffer, getImageSizeString } from '../helpers/imageHelpers.js';
import { IoMdOptions, IoMdRefresh } from 'react-icons/io';
import { GoImage, GoLinkExternal } from 'react-icons/go';
import { VariableSizeList as List } from 'react-window';

const Row = ({ index, style }) => <div style={style}>Row {index}</div>;

function App() {
  const [imageMap, setImageMap] = useState(null);
  const [imageMetadata, setImageMetadata] = useState({});
  const [scanningSelection, setScanningSelection] = useState(false);
  const canvasRef = React.useRef(null);
  const [canvasWidth, setCanvasWidth] = useState(100);
  const [canvasHeight, setCanvasHeight] = useState(100);
  const [selectionLength, setSelectionLength] = useState(0);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [quality, setQuality] = useState(30);
  const [qualityString, setQualityString] = useState('Average');
  const [resizeToFit, setResizeToFit] = useState(true);
  const [convertPNGs, setConvertPNGs] = useState(true);

  const onCompress = () => {
    parent.postMessage({ pluginMessage: { type: 'start-compress', imageMap } }, '*');
  };

  const onScan = () => {
    setImageMetadata({});
    setScanningSelection(true);
    setTimeout(() => {
      parent.postMessage({ pluginMessage: { type: 'start-scan' } }, '*');
    }, 250);
  };

  const gotImageMetadata = useCallback(
    async (imageHash, bytes) => {
      const url = URL.createObjectURL(new Blob([bytes]));
      const image = (await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject();
        img.src = url;
      })) as HTMLImageElement;

      const nodesForThisHash = Object.keys(imageMap[imageHash]);
      for (let i = 0; i < nodesForThisHash.length; i++) {
        setImageMetadata((imageMetadata) => {
          const newImageMetadata = JSON.parse(JSON.stringify(imageMetadata));
          newImageMetadata[imageHash + nodesForThisHash[i]] = {
            width: image.width,
            height: image.height,
            nodeID: nodesForThisHash[i],
            size: bytes.length,
            key: imageHash + nodesForThisHash[i],
          };

          return newImageMetadata;
        });
      }
    },
    [imageMap]
  );

  useEffect(() => {
    if (imageMap) {
      const imageHashes = Object.keys(imageMap);
      for (let i = 0; i < imageHashes.length; i++) {
        parent.postMessage({ pluginMessage: { type: 'get-image-metadata', imageHash: imageHashes[i] } }, '*');
      }
    }
  }, [imageMap]);

  const compressImage = useCallback(
    async (nodeList, bytes) => {
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
                break;
              case 'CROP':
              // TODO: Handle cropped image resizing
              // const transform = fill.imageTransform;
              // const croppedWidth = node.width / transform[0][0];
              // const croppedHeight = node.height / transform[1][1];
              // const xOff = croppedWidth * transform[0][2];
              // const yOff = croppedHeight * transform[1][2];
              // const widthRatio = croppedWidth / width;
              // const heightRatio = croppedHeight / height;

              default:
                break;
            }
          }

          if (scaleHeight === null) {
            scaleWidth = image.width;
            scaleHeight = image.height;
          }

          console.log('Scaling image from ', image.width, image.height);
          console.log('To ', scaleWidth, scaleHeight);
          ctx.canvas.width = scaleWidth;
          ctx.canvas.height = scaleHeight;
          setCanvasWidth(scaleWidth);
          setCanvasHeight(scaleHeight);
          ctx.drawImage(image, 0, 0, scaleWidth, scaleHeight);
          // Get blob from newly drawn canvas, reduce quality too if needed
          // const imageData = ctx.getImageData(0, 0, scaleWidth, scaleHeight);

          let mimeType = getMimeTypeFromArrayBuffer(bytes);

          if (mimeType === 'image/png') {
            const imageData = ctx.getImageData(0, 0, scaleWidth, scaleHeight);
            const data = imageData.data;
            let foundTransparency = false;
            for (let c = 0; c < data.length; c += 4) {
              if (data[c + 3] < 255) {
                foundTransparency = true;
                break;
              }
            }

            if (!foundTransparency && convertPNGs) {
              console.log('Converting to jpg...');
              mimeType = 'image/jpeg';
            }
          }

          console.log('=========================');

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
            quality / 100.0
          );
        }
      }
    },
    [quality, resizeToFit, convertPNGs]
  );

  useEffect(() => {
    window.onmessage = (event) => {
      const { type, message } = event.data.pluginMessage;
      if (type === 'selected-images') {
        setImageMap(message);
        setScanningSelection(false);
      } else if (type === 'start-selection') {
        setSelectionLength(message);
      } else if (type === 'compress-image') {
        compressImage(message.nodeList, message.bytes);
      } else if (type === 'image-metadata') {
        gotImageMetadata(message.imageHash, message.bytes);
      }
    };
  }, [quality, resizeToFit, convertPNGs, gotImageMetadata]);

  useEffect(() => {
    if (quality < 20) {
      setQualityString('Low');
    } else if (quality < 50) {
      setQualityString('Medium');
    } else if (quality < 80) {
      setQualityString('High');
    } else {
      setQualityString('Very high');
    }
  }, [quality]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        style={{ left: '100%', position: 'absolute' }}
      />

      {/* <p style={{ textAlign: 'start', marginLeft: 6, color: '#d17b26' }}>
        {selectionDirty ? 'Warning: Current selection is not scanned' : '\u00A0'}
      </p>
      <p style={{ textAlign: 'start', marginLeft: 6 }}>
        Images in selection: {imageMap ? Object.keys(imageMap).length : 0}
      </p> */}

      {/* Scan button */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'flex-start',
          marginLeft: 8,
          marginBottom: 16,
        }}
      >
        <button onClick={onScan} style={{ minWidth: 230 }} disabled={scanningSelection}>
          {scanningSelection ? (
            'Scanning selection...'
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
              <IoMdRefresh style={{ transform: 'scale(1.4)', marginLeft: -4 }} />
              Find images in selection ({selectionLength})
            </div>
          )}
        </button>
      </div>

      <div className="optionsWrapper">
        <div
          className="optionsContainer"
          style={
            optionsOpen
              ? {
                  border: '1px solid var(--figma-color-text-disabled)',
                }
              : {}
          }
        >
          <div
            className="optionToggle"
            onClick={() => {
              setOptionsOpen(!optionsOpen);
            }}
          >
            Options <IoMdOptions style={{ transform: 'scale(1.8)', width: 30 }} />
          </div>
          {optionsOpen && (
            <div style={{ padding: '24px 16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'start' }}>
                <div className="qualityLabelContainer">
                  <label htmlFor="quality" style={{ marginLeft: 6, fontWeight: 'bold', userSelect: 'none' }}>
                    JPEG Compression quality
                  </label>
                  <div style={{ textAlign: 'end', opacity: 0.8 }}>{qualityString}</div>
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
                  id="convertPNGs"
                  type="checkbox"
                  checked={convertPNGs}
                  onChange={() => {
                    setConvertPNGs(!convertPNGs);
                  }}
                ></input>
                <label htmlFor="convertPNGs" style={{ marginLeft: 6, fontWeight: 'bold', userSelect: 'none' }}>
                  Convert PNGs to JPGs
                </label>
              </div>
              <div style={{ textAlign: 'start', marginLeft: 6, marginTop: 8, opacity: 0.8 }}>
                Images with no transparent pixels will be converted to JPEGs, which have smaller filesizes when
                compressed.
              </div>

              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', marginTop: 24 }}>
                <input
                  id="resize"
                  type="checkbox"
                  checked={resizeToFit}
                  onChange={() => {
                    setResizeToFit(!resizeToFit);
                  }}
                ></input>
                <label htmlFor="resize" style={{ marginLeft: 6, fontWeight: 'bold', userSelect: 'none' }}>
                  Resize images to fit container
                </label>
              </div>
              <div style={{ textAlign: 'start', marginLeft: 6, marginTop: 8, opacity: 0.8 }}>
                If image fills are larger than the object they're applied to, the plugin will resize the images down to
                fit the container.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scanned images */}
      <div className="imageArea">
        {imageMetadata &&
          Object.values(imageMetadata)
            .sort((a, b) => (b as any).size - (a as any).size)
            .map((item) => (
              <div
                className="imageRow"
                key={(item as any).key}
                onClick={() => {
                  parent.postMessage(
                    { pluginMessage: { type: 'go-to-image-fill', nodeID: (item as any).nodeID } },
                    '*'
                  );
                }}
              >
                <GoImage style={{ width: 25, height: 20 }} />
                <div style={{ marginRight: 4 }}>
                  {(item as any).width} × {(item as any).height}
                </div>
                <div style={{ opacity: 0.6 }}>— {getImageSizeString((item as any).size)}</div>
                <GoLinkExternal className="imageRowGoIcon" style={{ width: 18, height: 18, marginLeft: 12 }} />
              </div>
            ))}
      </div>

      {/* Button container */}
      <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'flex-end', margin: 4, marginRight: 8 }}>
        <button
          id="compress"
          onClick={onCompress}
          disabled={scanningSelection || !imageMap || Object.keys(imageMap).length <= 0}
        >
          Compress images
        </button>
      </div>
    </div>
  );
}

export default App;
