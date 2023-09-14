import React, { useState } from 'react';
import '../styles/ui.css';

function App() {
  const [imageMap, setImageMap] = useState(null);
  const [scanningSelection, setScanningSelection] = useState(false);

  const onCancel = () => {
    parent.postMessage({ pluginMessage: { type: 'cancel' } }, '*');
  };

  const onCompress = () => {
    parent.postMessage({ pluginMessage: { type: 'start-compress', imageMap } }, '*');
  };

  React.useEffect(() => {
    // This is how we read messages sent from the plugin controller
    window.onmessage = (event) => {
      const { type, message } = event.data.pluginMessage;
      if (type === 'compress-images') {
        console.log(`Figma Says: ${message}`);
      } else if (type === 'selected-images') {
        console.log('Got end');
        setImageMap(message);
        setScanningSelection(false);
      } else if (type === 'start-selection') {
        console.log('Got start');
        setScanningSelection(true);
        setTimeout(() => {
          parent.postMessage({ pluginMessage: { type: 'start-scan' } }, '*');
        }, 250);
      }
    };
  }, []);

  return (
    <div>
      <h2>Image Compressor</h2>
      <p>{scanningSelection && 'Scanning selection...'}</p>
      <p>Images in selection: {imageMap ? Object.keys(imageMap).length : 0}</p>

      {imageMap && Object.keys(imageMap).length > 0 && (
        <button id="compress" onClick={onCompress}>
          Compress
        </button>
      )}
      <button onClick={onCancel}>Cancel</button>
    </div>
  );
}

export default App;
