import { Router } from 'express';
import { verifyWebhook, handleIncomingMessage } from '../controllers/webhookController';

const router = Router();

// Meta calls GET to verify the webhook endpoint
router.get('/', verifyWebhook);

// Meta POSTs all incoming messages and status updates here
router.post('/', handleIncomingMessage);

export { router as webhookRouter };
