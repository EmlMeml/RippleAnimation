import React, { useState } from 'react';
import type {ChangeEvent} from 'react';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import mammoth from 'mammoth';

interface FileUploaderProps {
  onTextLoad?: (text: string) => void;
}

export default function FileUploader({ onTextLoad }: FileUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0] ?? null;
    setFile(selectedFile);
    setError(null);

    if (!selectedFile) {
      return;
    }

    try{
        if(selectedFile.name.toLowerCase().endsWith('.docx')){
            const arrayBuffer = await selectedFile.arrayBuffer();
            const result = await mammoth.extractRawText({
                arrayBuffer,
            });
            onTextLoad?.(result.value);
        }else{
            const reader = new FileReader();
            reader.onload = () => {
                const text = typeof reader.result === 'string' ? reader.result : '';
                onTextLoad?.(text);
            };
            reader.onerror = () => {
                setError('Unable to read the selected file.');
            };
            reader.readAsText(selectedFile);
        }
    }catch(err){
        console.error(err);
        setError('Unable to read the selected File');
    }

    
  }

  return (
    <div>
      <label
        style={{
          cursor: 'pointer',
          padding: '4px 8px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <UploadFileIcon style={{ color: '#263a4a' }} />
        Upload File
        <input
          type="file"
          accept=".txt,.md,.json,.js,.ts,.tsx,.docx"
          onChange={handleFileChange}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
            border: 0,
            padding: 0,
            margin: 0
          }}
        />
      </label>
      {error && <div style={{ marginTop: '8px', color: 'red' }}>{error}</div>}
    </div>
  );
}