figma.showUI(__html__);

const findNodesWithImages = (selection, result) => {
  selection.forEach((item) => {
    if (item.fills && item.fills.length > 0) {
      item.fills.every((fill) => {
        if (fill.type === 'IMAGE') {
          result.push(item);
          return false;
        }
        return true;
      });
    }
    if (typeof item.children !== 'undefined') {
      findNodesWithImages(item.children, result);
    }
  });
};

figma.on('selectionchange', () => {
  if (figma.currentPage.selection.length > 0) {
    figma.ui.postMessage({
      type: 'start-selection',
    });
  } else {
    figma.ui.postMessage({
      type: 'selected-images',
      message: null,
    });
  }
});

const startScan = () => {
  let nodesWithImages = [];
  findNodesWithImages(figma.currentPage.selection, nodesWithImages);
  filterOutGifs(nodesWithImages);
};

const filterOutGifs = (imageNodes) => {
  let imageFills = [];
  let imageHashToNodeMap = {};

  imageNodes.forEach((node) => {
    imageFills = imageFills.concat(node.fills);
    node.fills.forEach((fill) => {
      if (typeof fill.imageHash !== 'undefined') {
        if (fill.imageHash in imageHashToNodeMap) {
          imageHashToNodeMap[fill.imageHash][node.id] = true;
        } else {
          imageHashToNodeMap[fill.imageHash] = {
            [node.id]: true,
          };
        }
      }
    });
  });

  // TODO: This is still throwing a ton of errors, skip this?
  // const allImageHashes = Object.keys(imageHashToNodeMap);
  // const gifImageHashes = [];

  // for (let i = 0; i < allImageHashes.length; i++) {
  //   const image = figma.getImageByHash(allImageHashes[i]);
  //   if (image !== null) {
  //     const bytes = await image.getBytesAsync();
  //     if (isGif(bytes)) {
  //       gifImageHashes.push(allImageHashes[i]);
  //     }
  //   }
  // }

  // for (let i = 0; i < gifImageHashes.length; i++) {
  //   delete imageHashToNodeMap[gifImageHashes[i]];
  // }

  figma.ui.postMessage({
    type: 'selected-images',
    message: imageHashToNodeMap,
  });
};

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'compress-images') {
    figma.ui.postMessage({
      type: 'compress-images',
      message: `Compressed ${msg.count} images`,
    });
  } else if (msg.type === 'filter-out-gifs') {
    filterOutGifs(msg.imageNodes);
  } else if (msg.type === 'start-scan') {
    startScan();
  } else if (msg.type === 'start-compress') {
    const imageMap = msg.imageMap;
    console.log('Will compress...', imageMap);
  }

  // figma.closePlugin();
};
