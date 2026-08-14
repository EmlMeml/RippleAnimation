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
        const fileName = selectedFile.name.toLowerCase();

        // -----------------------------
        // DOCX
        // -----------------------------
        if (fileName.endsWith(".docx")) {
          const arrayBuffer = await selectedFile.arrayBuffer();

          const result = await mammoth.convertToHtml({
            arrayBuffer,
          });

          onHtmlLoad?.(result.value);
          return;
        }

        // -----------------------------
        // HTML
        // -----------------------------
        if (
          fileName.endsWith(".html") ||
          fileName.endsWith(".htm")
        ) {
          const html = await selectedFile.text();

          onHtmlLoad?.(html);
          return;
        }

        // -----------------------------
        // TXT / MD / JSON / JS / TS / TSX
        // -----------------------------
        const text = await selectedFile.text();

        onTextLoad?.(text);
    }catch(err){
        console.error(err);
        setError('Unable to read the selected File');
    }

    
  }

  return (
    <div className='uploadDiv'>
      <label
        className='fileUploadBtn'
      >
        <UploadFileIcon style={{ color: '#2b311c' }} />
        Upload File
        <input
          type="file"
          accept=".txt,.md,.json,.js,.ts,.tsx,.docx,.html"
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