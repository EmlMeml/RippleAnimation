import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import './App.css'
import RichTextEditor from './custom/editor/Editor';
import type { StoryContext } from "./types/story";

function App() {
  const storyContext: StoryContext = {
    referenceDate: "2026-08-14",
  };

  return (
    <>
    <Box sx={{flowGrow: 1}}>
      <Grid container spacing={2}>
        <Grid size={12} sx={{display: 'flex', justifyContent: 'center', alignItems:'center'}}>
          <h1>Ripple Animation</h1>
        </Grid>
      </Grid>
      <Grid container spacing={2}>
        <Grid size={12} sx={{display: 'flex', justifyContent: 'center', alignItems:'center', height:'720px'}}>
          <RichTextEditor context={storyContext}></RichTextEditor>
        </Grid>
      </Grid>
    </Box>
     
    </>
  )
}

export default App
