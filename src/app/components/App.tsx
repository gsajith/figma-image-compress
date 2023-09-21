import React, { useCallback, useEffect, useState } from 'react';
import '../styles/ui.css';
import { getMimeTypeFromArrayBuffer, getQualityString, getImageSizeString } from '../helpers/imageHelpers.js';
import { IoMdOptions, IoMdRefresh } from 'react-icons/io';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import ImageRow, { createItemData } from './ImageRow';

function App() {
  // Map of imagehashes to node IDs which have that imagehash as a fill
  const [imageMap, setImageMap] = useState(null);
  // Map of imagehashes to that image's bytes
  const [hashToBytesMap, setHashToBytesMap] = useState({});

  // Data that is displayed in plugin UI for each image (dimensions, size, etc.)
  const [metadata, setMetadata] = useState([]);

  // Progress flags for scanning and compressing
  const [scanning, setScanning] = useState(false);
  const [compressing, setCompressing] = useState(false);

  // How many parent items are in the selection
  const [selectionLength, setSelectionLength] = useState(0);

  // Flag for if the options window is visible
  const [optionsOpen, setOptionsOpen] = useState(false);

  // Options state - quality, resize, convert PNGs
  const [quality, setQuality] = useState(45);
  const [resizeToFit, setResizeToFit] = useState(true);
  const [convertPNGs, setConvertPNGs] = useState(true);

  // Number of checked images in the UI
  const [numChecked, setNumChecked] = useState(0);

  // Total size saved
  const [totalSizeSaved, setTotalSizeSaved] = useState(0);

  const [canvasWidth, setCanvasWidth] = useState(100);
  const [canvasHeight, setCanvasHeight] = useState(100);
  const canvasRef = React.useRef(null);

  const onCompress = useCallback(() => {
    setCompressing(true);
    parent.postMessage({ pluginMessage: { type: 'start-compress', imageMap, hashToBytesMap, metadata } }, '*');
  }, [imageMap, hashToBytesMap, metadata]);

  const onScan = useCallback(() => {
    setMetadata([]);
    setScanning(true);
    setHashToBytesMap({});
    setTotalSizeSaved(0);
    setTimeout(() => {
      parent.postMessage({ pluginMessage: { type: 'start-scan' } }, '*');
    }, 250);
  }, []);

  const toggleItemChecked = useCallback(
    (index) => {
      setMetadata((oldMetadata) => {
        const metadata = oldMetadata.slice(0);
        const newItem = metadata[index] as any;
        newItem.included = !newItem.included;
        metadata[index] = newItem;
        return metadata;
      });
    },
    [metadata]
  );

  const setAllChecked = useCallback(
    (checked) => {
      setMetadata((oldMetadata) => {
        const metadata = oldMetadata.slice(0);
        for (let i = 0; i < metadata.length; i++) {
          const newItem = metadata[i] as any;
          newItem.included = checked;
          metadata[i] = newItem;
        }
        return metadata;
      });
    },
    [metadata]
  );

  const setCompressedSize = useCallback(
    (key, compressedSize) => {
      setMetadata((oldMetadata) => {
        const metadata = oldMetadata.slice(0);
        const targetIndex = metadata.findIndex((o) => o.imageHash + o.nodeID === key);
        if (targetIndex >= 0) {
          const targetItem = metadata[targetIndex];
          targetItem.compressedSize = compressedSize;
          targetItem.included = false;
          metadata[targetIndex] = targetItem;
        }
        return metadata;
      });
    },
    [metadata]
  );

  const goToItem = useCallback((nodeID) => {
    parent.postMessage({ pluginMessage: { type: 'go-to-image-fill', nodeID: nodeID } }, '*');
  }, []);

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
      // Insert into sorted array
      setMetadata((oldMetadata) => {
        const newMetadata = oldMetadata.slice(0);
        let insertIndex = -1;
        for (let i = 0; i < newMetadata.length; i++) {
          if (newMetadata[i].size < bytes.length) {
            insertIndex = i;
            break;
          }
        }
        for (let i = 0; i < nodesForThisHash.length; i++) {
          const newItem = {
            width: image.width,
            height: image.height,
            nodeID: nodesForThisHash[i],
            imageHash: imageHash,
            size: bytes.length,
            included: true,
          };
          if (insertIndex >= 0) {
            newMetadata.splice(insertIndex, 0, newItem);
          } else {
            newMetadata.push(newItem);
          }
        }
        return newMetadata;
      });

      setHashToBytesMap((oldHashToBytesMap) => {
        const newHashToBytesMap = { ...oldHashToBytesMap };
        newHashToBytesMap[imageHash] = bytes;
        return newHashToBytesMap;
      });
    },
    [imageMap, hashToBytesMap]
  );

  useEffect(() => {
    setNumChecked(metadata.reduce((totalChecked, current) => totalChecked + (current.included ? 1 : 0), 0));
    setTotalSizeSaved(
      metadata.reduce(
        (totalSizeSaved, current) =>
          totalSizeSaved +
          (typeof current.compressedSize !== 'undefined' ? Math.max(0, current.size - current.compressedSize) : 0),
        0
      )
    );
  }, [metadata]);

  useEffect(() => {
    if (numChecked === 0 && compressing) {
      setCompressing(false);
    }
  }, [numChecked, compressing]);

  useEffect(() => {
    if (imageMap) {
      const imageHashes = Object.keys(imageMap);
      for (let i = 0; i < imageHashes.length; i++) {
        parent.postMessage({ pluginMessage: { type: 'get-image-metadata', imageHash: imageHashes[i] } }, '*');
      }
    }
  }, [imageMap]);

  useEffect(() => {
    window.onmessage = (event) => {
      const { type, message } = event.data.pluginMessage;
      if (type === 'selected-images') {
        setImageMap(message);
        setScanning(false);
      } else if (type === 'start-selection') {
        setSelectionLength(message);
      } else if (type === 'compress-image') {
        compressImage(message.nodeList, message.bytes);
      } else if (type === 'image-metadata') {
        gotImageMetadata(message.imageHash, message.bytes);
      } else if (type === 'compressed-image') {
        setCompressedSize(message.key, message.compressedSize);
      }
    };
  }, [quality, resizeToFit, convertPNGs, gotImageMetadata]);

  const compressImage = useCallback(
    async (nodeList, bytes) => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      let url = null;
      let image = null;

      for (let i = 0; i < nodeList.length; i++) {
        const node = nodeList[i];
        // TODO: Scale this up by 2x for retina?
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

          // TODO: Caching for image fill - dimension combos so we don't have to do scaling multiple times
          // TODO: Above needs to include options in the cache key as well
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
                    key: targetHash + node.id,
                    compressedSize: arrayBuffer.byteLength,
                  },
                },
                '*'
              );
            },
            mimeType,
            quality / 100.0
          );
        }
      }
    },
    [quality, resizeToFit, convertPNGs]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        style={{ left: '100%', position: 'absolute' }}
      />

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
        <button onClick={onScan} style={{ minWidth: 230 }} disabled={scanning}>
          {scanning ? (
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
                  <div style={{ textAlign: 'end', opacity: 0.8 }}>{getQualityString(quality)}</div>
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
      {metadata && metadata.length > 1 && (
        <div
          className="topImageRow"
          onClick={() => {
            if (numChecked === metadata.length) {
              // Uncheck all
              setAllChecked(false);
            } else {
              // Check all
              setAllChecked(true);
            }
          }}
        >
          <input
            disabled={scanning || compressing}
            type="checkbox"
            style={{ marginRight: 8 }}
            checked={numChecked === metadata.length}
            onChange={() => {}}
          />
          <b>
            {numChecked}/{metadata.length} images found
          </b>
        </div>
      )}
      <div style={{ height: '100%', overflow: 'hidden' }}>
        {metadata && (
          <AutoSizer>
            {({ height, width }) => (
              <List
                className="imageArea"
                style={{ borderRadius: metadata.length > 0 ? '0px 0px 6px 6px' : '6px' }}
                height={height - 8}
                itemData={createItemData(metadata, toggleItemChecked, goToItem)}
                itemCount={metadata.length}
                itemSize={45}
                width={width - 16}
              >
                {ImageRow}
              </List>
            )}
          </AutoSizer>
        )}
      </div>

      {/* Button container */}
      <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'flex-end', margin: 4, marginRight: 8 }}>
        <div>{getImageSizeString(totalSizeSaved)}</div>
        <button
          id="compress"
          onClick={onCompress}
          disabled={scanning || !imageMap || Object.keys(imageMap).length <= 0 || compressing}
        >
          Compress images
        </button>
      </div>
    </div>
  );
}

export default App;
