import type {ReaderView} from './reader-view';

/** A new reading session keeps its page but starts with the complete PDF spread. */
export function bookOpeningView(page:number,saved?:ReaderView):ReaderView{
  return {...saved,page,zoom:1,pdfLayout:'spread',textMode:false,notesOpen:false,expanded:true,
    windowX:0,windowY:0,pdfX:0,pdfY:0,textY:0,webFile:undefined,capturedAt:saved?.capturedAt||Date.now()};
}
