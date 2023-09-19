import isGif from 'is-gif';
figma.showUI(__html__, { width: 400, height: 640, themeColors: true });

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

const selectionChange = () => {
  if (figma.currentPage.selection.length > 0) {
    figma.ui.postMessage({
      type: 'start-selection',
      message: figma.currentPage.selection.length,
    });
  } else {
    figma.ui.postMessage({
      type: 'selected-images',
      message: null,
    });
  }
};

setTimeout(() => selectionChange(), 300);

figma.on('selectionchange', selectionChange);

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

  figma.ui.postMessage({
    type: 'selected-images',
    message: imageHashToNodeMap,
  });
};

const compressAndApplyImage = async (imageHash, nodeIDs, bytes) => {
  const nodeList = nodeIDs
    .map((id) => figma.getNodeById(id))
    .map((node) => ({
      id: node.id,
      fills: node.fills,
      width: node.absoluteBoundingBox.width,
      height: node.absoluteBoundingBox.height,
      targetHash: imageHash,
    }));

  figma.ui.postMessage({
    type: 'compress-image',
    message: {
      nodeList: nodeList,
      bytes: bytes,
    },
  });
};

const startCompress = async (imageMap) => {
  const imageHashes = Object.keys(imageMap);

  for (let i = 0; i < imageHashes.length; i++) {
    const image = figma.getImageByHash(imageHashes[i]);
    if (image !== null) {
      const bytes = await image.getBytesAsync();
      if (!isGif(bytes)) {
        await compressAndApplyImage(imageHashes[i], Object.keys(imageMap[imageHashes[i]]), bytes);
      }
    }
  }
};

function clone(val) {
  return JSON.parse(JSON.stringify(val));
}

const replaceFill = async (nodeID, fillIndex, bytes) => {
  const node = figma.getNodeById(nodeID) as any;
  if (node !== null) {
    const newFills = clone(node.fills);
    if (fillIndex < newFills.length && fillIndex >= 0) {
      const oldFill = newFills[fillIndex];
      const newFill = clone(oldFill);
      newFill.imageHash = figma.createImage(new Uint8Array(bytes)).hash;
      newFills[fillIndex] = newFill;
    }
    node.fills = newFills;
  }
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
    console.log('Will try to compress...', msg.imageMap);
    startCompress(msg.imageMap);
  } else if (msg.type === 'set-fill') {
    console.log('Will replace fill for...', msg);
    replaceFill(msg.nodeID, msg.fillIndex, msg.bytes);
  }

  // figma.closePlugin();
};
