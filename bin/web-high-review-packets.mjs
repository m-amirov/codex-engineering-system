import fs from 'node:fs';
import path from 'node:path';
import { planWebHighReviewPackets } from '../src/web-high-review-packets.mjs';

const args=process.argv.slice(2);
const option=name=>{
 const i=args.indexOf(name);
 return i<0?null:args[i+1];
};
try {
 const ledgerFile=option('--ledger'),receiptFile=option('--receipts');
 if(!ledgerFile||!receiptFile)
   throw new Error('Usage: node bin/web-high-review-packets.mjs --ledger <json> --receipts <json> [--max-attachments 2] [--max-frames 3] [--quota-log <actual-error-log>]');
 const ledger=JSON.parse(fs.readFileSync(path.resolve(ledgerFile),'utf8'));
 const data=JSON.parse(fs.readFileSync(path.resolve(receiptFile),'utf8'));
 const receipts=Array.isArray(data)?data:data.records;
 const quotaFile=option('--quota-log');
 const quotaObservation=quotaFile
   ? {message:fs.readFileSync(path.resolve(quotaFile),'utf8'),evidenceRef:quotaFile}
   : null;
 const result=planWebHighReviewPackets(ledger,receipts,{
   maxAttachments:option('--max-attachments')===null?2:Number(option('--max-attachments')),
   maxFramesPerPacket:option('--max-frames')===null?3:Number(option('--max-frames')),
   quotaObservation
 });
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 if(result.rejectedReceipts.length)process.exitCode=2;
} catch(error) {
 process.stderr.write(error.message+'\n');
 process.exitCode=2;
}
