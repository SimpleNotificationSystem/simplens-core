/**
 * Plugins Routes
 * 
 * Exposes plugin metadata, installation, update, and uninstallation endpoints
 */

import { Router } from 'express';
import {
  getPluginsMetadata,
  listInstalledPlugins,
  listPluginCatalog,
  installPlugin,
  changePluginVersion,
  uninstallPlugin,
  getNpmAuth,
  saveNpmAuth,
  deleteNpmAuth,
} from '../controllers/plugins.controller.js';

const router = Router();

router.get('/', getPluginsMetadata);
router.get('/installed', listInstalledPlugins);
router.get('/catalog/:category', listPluginCatalog);
router.get('/npm-auth', getNpmAuth);
router.post('/npm-auth', saveNpmAuth);
router.delete('/npm-auth', deleteNpmAuth);
router.post('/install', installPlugin);
router.put('/version', changePluginVersion);
router.delete('/:scope/:package', uninstallPlugin);
router.delete('/:package', uninstallPlugin);
router.delete('/', uninstallPlugin);

export default router;
