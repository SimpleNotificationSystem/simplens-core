import express from 'express';
import type {Request, Response} from 'express';
import { env } from '@src/config/env.config.js';

const app = express();

app.use(express.json());

app.get("/", (req: Request, res: Response)=>{
    res.json({
        "info": "Notification Service is running"
    });
    return;
})

const server = app.listen(env.PORT, ()=>console.log(`Notification Service running at http://localhost:${env.PORT}`));

server.on('error', (err) => {
    console.error('Server error:', err);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
});