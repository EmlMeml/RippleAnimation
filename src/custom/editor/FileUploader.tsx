import { useState } from 'react';
import type {ChangeEvent} from 'react';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import mammoth from 'mammoth';

interface FileUploaderProps {
  onTextLoad?: (text: string) => void;
  onHtmlLoad?: (html: string) => void;
}

export default function FileUploader({ onTextLoad,onHtmlLoad }: FileUploaderProps) {
  const [, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  // handle File Type: txt or Docx
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
            const result = await mammoth.convertToHtml({
                arrayBuffer,
            });
            onHtmlLoad?.(result.value);
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
          height:'38px',
          paddingRight:'12px',
          paddingLeft:'8px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          position: 'relative',
          overflow: 'hidden',
          color: '#000000',
          border: '1px solid #000000',
          borderRadius:'4px',
          background:'#ba9a91',
          fontSize:'14px'
        }}
      >
        <UploadFileIcon style={{ color: '#000000' }} />
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
            margin: 0,
            color: '#666e5b',
          }}
        />
      </label>
      {error && <div style={{ marginTop: '8px', color: 'red' }}>{error}</div>}
    </div>
  );
}