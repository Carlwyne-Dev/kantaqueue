import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';

// Route segment config
export const size = { width: 128, height: 128 };
export const contentType = 'image/png';

export default function Icon() {
  // Read local file
  const filePath = join(process.cwd(), 'public', 'assets', 'logo.png');
  let base64 = '';
  try {
    const data = readFileSync(filePath);
    base64 = data.toString('base64');
  } catch(e) {
    console.error('Could not read logo.png', e);
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '32px', // nice rounded soft edge
          overflow: 'hidden',
          backgroundColor: 'transparent', // Make corners transparent
        }}
      >
        {base64 ? (
          <img
            src={`data:image/png;base64,${base64}`}
            style={{
              width: '140%', // zoom in to hide the white padding
              height: '140%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div style={{ background: '#A7B79A', width: '100%', height: '100%' }} />
        )}
      </div>
    ),
    { ...size }
  );
}
