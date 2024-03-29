import React, { useCallback, useEffect, useState } from 'react';
import '../styles/ui.css';
import '../styles/loader.css';
import { getMimeTypeFromArrayBuffer, getQualityString, getImageSizeString } from '../helpers/imageHelpers.js';
import { IoMdRefresh } from 'react-icons/io';
import { IoSettingsOutline } from 'react-icons/io5';
import { ImFilesEmpty } from 'react-icons/im';
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
  const [numCompressed, setNumCompressed] = useState(0);

  // Size metrics
  const [totalSizeSaved, setTotalSizeSaved] = useState(0);
  const [totalSizeSelected, setTotalSizeSelected] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [preCompressSize, setPreCompressSize] = useState(0);
  const [postCompressSize, setPostCompressSize] = useState(0);

  // State for dummy canvas to draw images to
  const [canvasWidth, setCanvasWidth] = useState(100);
  const [canvasHeight, setCanvasHeight] = useState(100);
  const canvasRef = React.useRef(null);

  const [expectedMetadataCount, setExpectedMetadataCount] = useState(0);

  const onCompress = useCallback(() => {
    setCompressing(true);
    setOptionsOpen(false);
    parent.postMessage({ pluginMessage: { type: 'start-compress', imageMap, hashToBytesMap, metadata } }, '*');
  }, [imageMap, hashToBytesMap, metadata]);

  const onScan = useCallback(() => {
    setMetadata([]);
    setScanning(true);
    setHashToBytesMap({});
    setTotalSizeSaved(0);
    setNumCompressed(0);
    setTotalSizeSelected(0);
    setTotalSize(0);
    setPreCompressSize(0);
    setPostCompressSize(0);
    setOptionsOpen(false);
    setImageMap(null);
    setExpectedMetadataCount(0);
    setTimeout(() => {
      parent.postMessage({ pluginMessage: { type: 'start-scan' } }, '*');
    }, 250);
  }, []);

  const toggleItemChecked = useCallback(
    (index) => {
      setMetadata((oldMetadata) => {
        const metadata = oldMetadata.slice(0);
        const newItem = metadata[index] as any;
        newItem.included = !newItem.included && typeof newItem.compressedSize === 'undefined';
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
          newItem.included = checked && typeof newItem.compressedSize === 'undefined';
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
    if (metadata && metadata.length > 0 && metadata.length >= expectedMetadataCount) {
      setScanning(false);
    }
  }, [metadata, expectedMetadataCount]);

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
    setPreCompressSize(
      metadata.reduce(
        (preCompressSize, current) =>
          preCompressSize + (typeof current.compressedSize !== 'undefined' ? current.size : 0),
        0
      )
    );
    setPostCompressSize(
      metadata.reduce(
        (postCompressSize, current) =>
          postCompressSize + (typeof current.compressedSize !== 'undefined' ? current.compressedSize : 0),
        0
      )
    );
    setTotalSizeSelected(
      metadata.reduce((totalSizeSelected, current) => totalSizeSelected + (current.included ? current.size : 0), 0)
    );
    setTotalSize(metadata.reduce((totalSize, current) => totalSize + current.size, 0));
    setNumCompressed(
      metadata.reduce(
        (totalCompressed, current) => totalCompressed + (typeof current.compressedSize !== 'undefined' ? 1 : 0),
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
        parent.postMessage(
          {
            pluginMessage: {
              type: 'get-image-metadata',
              imageHash: imageHashes[i],
              numRepeats: Object.keys(imageMap[imageHashes[i]]).length,
            },
          },
          '*'
        );
        setExpectedMetadataCount((expected) => expected + Object.keys(imageMap[imageHashes[i]]).length);
      }
    }
  }, [imageMap]);

  useEffect(() => {
    window.onmessage = (event) => {
      const { type, message } = event.data.pluginMessage;
      if (type === 'selected-images') {
        setImageMap(message);
      } else if (type === 'start-selection') {
        setSelectionLength(message);
      } else if (type === 'compress-image') {
        compressImage(message.nodeList, message.bytes);
      } else if (type === 'image-metadata') {
        gotImageMetadata(message.imageHash, message.bytes);
      } else if (type === 'compressed-image') {
        setCompressedSize(message.key, message.compressedSize);
      } else if (type === 'skipping-gif') {
        setExpectedMetadataCount((count) => count - message.numRepeats);
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
        const height = node.height * 2;
        const width = node.width * 2;
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

      {/* ============================================ Options container ============================================ */}
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
            <IoSettingsOutline style={{ transform: 'scale(1.8)', width: 30 }} />
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
                  Convert PNGs to JPGs (recommended)
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
                If image fills are larger than the object they're applied to, the plugin will scale the images down to
                fit the container.
              </div>
            </div>
          )}
        </div>
      </div>
      {/* ============================================ Scan button ============================================ */}
      <div className="scanButtonContainer">
        <button onClick={onScan} style={{ minWidth: 230 }} disabled={scanning || selectionLength === 0 || compressing}>
          {scanning ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginTop: -2,
              }}
            >
              <div className="lds-ripple-sm">
                <div></div>
                <div></div>
              </div>
              Scanning selection...
            </div>
          ) : selectionLength === 0 ? (
            'Select something to scan'
          ) : compressing ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginTop: -2,
              }}
            >
              <div className="lds-facebook">
                <div></div>
                <div></div>
                <div></div>
              </div>
              Compressing...
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
              <IoMdRefresh style={{ transform: 'scale(1.4)', marginLeft: -4 }} />
              Find images in selection ({selectionLength})
            </div>
          )}
        </button>
      </div>
      {/* ============================================ Scanned images ============================================ */}
      {metadata && metadata.length > 1 && metadata.length - numCompressed > 0 && (
        <div
          className="topImageRow"
          onClick={() => {
            if (numChecked === metadata.length - numCompressed) {
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
            checked={numChecked === metadata.length - numCompressed}
            onChange={() => {}}
          />
          {numChecked}/{metadata.length - numCompressed} images selected
          <div style={{ opacity: 0.6, marginLeft: 4, fontWeight: 400 }}>
            — {getImageSizeString(totalSizeSelected)}{' '}
            {totalSizeSelected !== totalSize - preCompressSize && (
              <>of {getImageSizeString(totalSize - preCompressSize)}</>
            )}
          </div>
        </div>
      )}
      <div
        style={{
          height: '100%',
          overflow: 'hidden',
          marginBottom: metadata.length === 0 ? 8 : 0,
        }}
      >
        {metadata.length === 0 && !imageMap && (
          <div
            className="imageArea"
            style={{
              boxSizing: 'border-box',
              justifyContent: 'center',
              alignItems: 'center',
              display: 'flex',
            }}
          >
            <div
              style={{
                fontSize: 14,
                opacity: 0.3,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
              }}
            >
              {scanning ? (
                <>
                  <div className="lds-ripple">
                    <div></div>
                    <div></div>
                  </div>
                  Scanning...
                </>
              ) : (
                <>
                  <ImFilesEmpty style={{ width: 32, height: 32 }} />
                  Awaiting scan
                </>
              )}
            </div>
          </div>
        )}
        {metadata && (
          <AutoSizer>
            {({ height, width }) => (
              <List
                className="imageArea"
                style={{
                  borderRadius: metadata.length > 1 && metadata.length - numCompressed > 0 ? '0px 0px 6px 6px' : '6px',
                }}
                height={height - 8}
                itemData={createItemData(metadata, toggleItemChecked, goToItem, compressing, scanning, hashToBytesMap)}
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
      {/* ============================================ Bottom button container ============================================ */}
      <div className="bottomButtonContainer">
        <div style={{ marginLeft: 6, marginRight: 8, width: '100%' }}>
          {!scanning && metadata.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {totalSizeSaved > 0 ? (
                <div>
                  <span style={{ opacity: 0.6, marginRight: 4 }}>{getImageSizeString(preCompressSize)}</span>
                  <span style={{ fontWeight: 'bold', color: 'var(--figma-color-text-success)', marginTop: -3 }}>
                    ⭢ {getImageSizeString(postCompressSize)} (-
                    {Math.max(0, (1 - postCompressSize / preCompressSize) * 100).toFixed(0)}%)
                  </span>
                </div>
              ) : (
                <div>
                  {numChecked === 0
                    ? numCompressed === metadata.length
                      ? 'All images compressed'
                      : 'Select images to compress'
                    : compressing
                    ? 'Compressing...'
                    : 'Ready to compress!'}
                </div>
              )}
              <div className="compressionStatusContainer">
                <div style={{ zIndex: 2 }}>
                  {numCompressed}/{numChecked + numCompressed} compressed
                </div>
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    width: `${Math.min(
                      100,
                      Math.max(0, Math.round((numCompressed / (numChecked + numCompressed)) * 100))
                    )}%`,
                    height: '100%',
                    background: 'var(--figma-color-bg-brand)',
                  }}
                />
              </div>
            </div>
          )}
        </div>
        <button
          id="compress"
          onClick={onCompress}
          disabled={scanning || !imageMap || Object.keys(imageMap).length <= 0 || compressing || numChecked === 0}
        >
          Compress images
        </button>
      </div>
    </div>
  );
}

export default App;
