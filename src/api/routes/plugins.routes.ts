/**
 * Plugins Routes
 * 
 * Exposes plugin metadata, installation, update, and uninstallation endpoints
 */

import { Router } from 'express';
import {
  getPluginsMetadata,
  listInstalledPlugins,
  installPlugin,
  changePluginVersion,
  uninstallPlugin,
} from '../controllers/plugins.controller.js';

const router = Router();

router.get('/', getPluginsMetadata);
router.get('/installed', listInstalledPlugins);
router.post('/install', installPlugin);
router.put('/version', changePluginVersion);
router.delete('/:scope/:package', uninstallPlugin);
router.delete('/:package', uninstallPlugin);
router.delete('/', uninstallPlugin);

export default router;
