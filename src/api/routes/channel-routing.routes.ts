/**
 * Channel Routing Routes
 * 
 * Endpoints for configuring default and cascading fallback provider chains
 */

import { Router } from 'express';
import {
  listChannelRoutings,
  getChannelRouting,
  setChannelRouting,
  deleteChannelRouting,
} from '../controllers/channel-routing.controller.js';

const router = Router();

router.get('/', listChannelRoutings);
router.get('/:channel', getChannelRouting);
router.put('/:channel', setChannelRouting);
router.delete('/:channel', deleteChannelRouting);

export default router;
