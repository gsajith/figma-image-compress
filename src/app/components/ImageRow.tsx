import React, { memo } from 'react';
import { getImageSizeString } from '../helpers/imageHelpers.js';
import { GoImage, GoLinkExternal } from 'react-icons/go';
import { areEqual } from 'react-window';
import memoize from 'memoize-one';

const ImageRow = memo(({ data, index, style }: any) => {
  const { items, toggleItemChecked, goToItem } = data;
  const item = items[index];

  const navigate = (e) => {
    e.stopPropagation();
    goToItem((item as any).nodeID);
  };

  return (
    <div className="imageRow" style={style} onClick={() => toggleItemChecked(index)}>
      <input type="checkbox" checked={item.included} />
      <div className="imageRowContent" onClick={navigate}>
        <GoImage style={{ width: 25, height: 20 }} />
        <div style={{ marginRight: 4 }}>
          {(item as any).width} × {(item as any).height}
        </div>
        <div style={{ opacity: 0.6 }}>— {getImageSizeString((item as any).size)}</div>
        <GoLinkExternal className="imageRowGoIcon" style={{ width: 18, height: 18, marginLeft: 12 }} />
      </div>
    </div>
  );
}, areEqual);

export const createItemData = memoize((items, toggleItemChecked, goToItem) => ({
  items,
  toggleItemChecked,
  goToItem,
}));

export default ImageRow;
