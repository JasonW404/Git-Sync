import { render } from 'ink';
import React from 'react';
import TuiApp from './tui/app.tsx';

const configPath = process.argv[2] || process.env.GIT_SYNC_CONFIG || '/app/config/git-sync.yaml';
const statePath = process.argv[3] || process.env.GIT_SYNC_STATE || '/app/state/state.db';

render(React.createElement(TuiApp, { configPath, statePath }));