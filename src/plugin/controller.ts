import isGif from 'is-gif';
figma.showUI(__html__, { width: 400, height: 500, themeColors: true });

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
  figma.ui.postMessage({
    type: 'start-selection',
    message: figma.currentPage.selection.length,
  });
};

setTimeout(() => selectionChange(), 300);

figma.on('selectionchange', selectionChange);

const startScan = () => {
  let nodesWithImages = [];
  findNodesWithImages(figma.currentPage.selection, nodesWithImages);
  filterOutGifs(nodesWithImages);
};

const filterOutGifs = async (imageNodes) => {
  let imageFills = [];
  let imageHashToNodeMap = {};

  imageNodes.forEach((node) => {
    imageFills = imageFills.concat(node.fills);
    node.fills.forEach(async (fill) => {
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

const startCompress = async (imageMap, hashToBytesMap, metadata) => {
  // TODO: Don't call compress on items where metadata is set to 'off'
  const imageHashes = Object.keys(imageMap);

  for (let i = 0; i < imageHashes.length; i++) {
    const imageHash = imageHashes[i];
    const bytes = hashToBytesMap[imageHash];
    if (bytes !== null && typeof bytes !== 'undefined') {
      if (!isGif(bytes)) {
        const nodeIDs = Object.keys(imageMap[imageHash]);

        // Filtering out any nodes/images which are not selected in the plugin UI
        const filteredNodeIDs = nodeIDs.filter((nodeID) => {
          const metadataItem = metadata.find((item) => item.imageHash === imageHash && item.nodeID === nodeID);
          return typeof metadataItem !== 'undefined' ? metadataItem.included : false;
        });

        await compressAndApplyImage(imageHash, filteredNodeIDs, bytes);
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

const getImageMetadata = async (imageHash, numRepeats) => {
  const image = figma.getImageByHash(imageHash);
  const bytes = await image.getBytesAsync();

  if (!isGif(bytes)) {
    figma.ui.postMessage({
      type: 'image-metadata',
      message: {
        imageHash: imageHash,
        bytes: bytes,
      },
    });
  } else {
    figma.ui.postMessage({
      type: 'skipping-gif',
      message: {
        numRepeats,
      },
    });
  }
};

const goToImageFill = (nodeID) => {
  const node = figma.getNodeById(nodeID) as any;
  figma.currentPage.selection = [node];
  figma.viewport.scrollAndZoomIntoView([node]);
};

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'filter-out-gifs') {
    filterOutGifs(msg.imageNodes);
  } else if (msg.type === 'start-scan') {
    startScan();
  } else if (msg.type === 'start-compress') {
    console.log('Will try to compress...', msg.metadata);
    startCompress(msg.imageMap, msg.hashToBytesMap, msg.metadata);
  } else if (msg.type === 'set-fill') {
    console.log('Will replace fill for...', msg);
    replaceFill(msg.nodeID, msg.fillIndex, msg.bytes);

    figma.ui.postMessage({
      type: 'compressed-image',
      message: {
        key: msg.key,
        compressedSize: msg.compressedSize,
      },
    });
  } else if (msg.type === 'get-image-metadata') {
    getImageMetadata(msg.imageHash, msg.numRepeats);
  } else if (msg.type === 'go-to-image-fill') {
    goToImageFill(msg.nodeID);
  }

  // figma.closePlugin();
};
