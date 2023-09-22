import React, { memo, useCallback, useEffect, useRef } from 'react';
import { getImageSizeString } from '../helpers/imageHelpers.js';
import { GoLinkExternal } from 'react-icons/go';
import { areEqual } from 'react-window';
import memoize from 'memoize-one';

const DRAW_SIZE = 90;

const ImageRow = memo(({ data, index, style }: any) => {
  const { items, toggleItemChecked, goToItem, compressing, scanning, hashToBytesMap } = data;
  const item = items[index] as any;
  const bytes = hashToBytesMap[item.imageHash];
  const canvasRef = useRef(null);

  const navigate = (e) => {
    e.stopPropagation();
    goToItem(item.nodeID);
  };

  const updateCanvas = useCallback(async (bytes) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let url = URL.createObjectURL(new Blob([bytes]));
    let image = (await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject();
      img.src = url;
    })) as HTMLImageElement;

    const imageRatio = image.height / image.width;
    const drawHeight = imageRatio > 1 ? DRAW_SIZE : imageRatio * DRAW_SIZE;
    const drawWidth = imageRatio < 1 ? DRAW_SIZE : DRAW_SIZE / imageRatio;
    const startX = (DRAW_SIZE - drawWidth) / 2;
    const startY = (DRAW_SIZE - drawHeight) / 2;

    ctx.drawImage(image, startX, startY, drawWidth, drawHeight);
  }, []);

  useEffect(() => {
    if (bytes && typeof bytes !== undefined) {
      updateCanvas(bytes);
    }
  }, [bytes]);

  return (
    <div className="imageRow" style={style} onClick={() => toggleItemChecked(index)} key={item.imageHash + item.nodeID}>
      {typeof item.compressedSize === 'undefined' && (
        <input type="checkbox" checked={item.included} onChange={() => {}} disabled={scanning || compressing} />
      )}
      <div className="imageRowContent" onClick={navigate}>
        <div
          style={{
            backgroundColor: 'var(--figma-color-bg-tertiary)',
            borderRadius: 4,
            overflow: 'hidden',
            marginLeft: 4,
            marginRight: 4,
          }}
        >
          <canvas
            style={{
              width: DRAW_SIZE / 3,
              height: DRAW_SIZE / 3,
              padding: 2,
            }}
            ref={canvasRef}
            width={DRAW_SIZE}
            height={DRAW_SIZE}
          />
        </div>
        <div style={{ marginLeft: 4 }}>
          {item.width} × {item.height}
        </div>
        <div style={{ opacity: 0.6, marginRight: 4 }}>— {getImageSizeString(item.size)}</div>

        {/* FIXME: Account for negatives in red here */}
        {item.compressedSize && (
          <div style={{ fontWeight: 'bold', color: 'var(--figma-color-text-success)', marginTop: -3 }}>
            ⭢ {getImageSizeString(item.compressedSize)} (-
            {Math.max(0, (1 - item.compressedSize / item.size) * 100).toFixed(0)}%)
          </div>
        )}
        <GoLinkExternal className="imageRowGoIcon" style={{ width: 18, height: 18, marginLeft: 12 }} />
      </div>
    </div>
  );
}, areEqual);

export const createItemData = memoize((items, toggleItemChecked, goToItem, compressing, scanning, hashToBytesMap) => ({
  items,
  toggleItemChecked,
  goToItem,
  compressing,
  scanning,
  hashToBytesMap,
}));

export default ImageRow;
