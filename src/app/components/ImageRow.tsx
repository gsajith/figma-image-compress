import React, { memo } from 'react';
import { getImageSizeString } from '../helpers/imageHelpers.js';
import { GoImage, GoLinkExternal } from 'react-icons/go';
import { areEqual } from 'react-window';
import memoize from 'memoize-one';

const ImageRow = memo(({ data, index, style }: any) => {
  const { items, toggleItemChecked, goToItem, compressing, scanning } = data;
  const item = items[index] as any;

  const navigate = (e) => {
    e.stopPropagation();
    goToItem(item.nodeID);
  };

  return (
    <div className="imageRow" style={style} onClick={() => toggleItemChecked(index)} key={item.imageHash + item.nodeID}>
      {typeof item.compressedSize === 'undefined' && (
        <input type="checkbox" checked={item.included} onChange={() => {}} disabled={scanning || compressing} />
      )}
      <div className="imageRowContent" onClick={navigate}>
        <div style={{ marginLeft: 4 }}>
          {item.width} × {item.height}
        </div>
        <GoImage style={{ width: 25, height: 20 }} />
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

export const createItemData = memoize((items, toggleItemChecked, goToItem, compressing, scanning) => ({
  items,
  toggleItemChecked,
  goToItem,
  compressing,
  scanning,
}));

export default ImageRow;
