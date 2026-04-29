import React from 'react';
import { render } from 'ink';
import TuiApp from './app.tsx';

const configPath = process.argv[2] || '/app/config/git-sync.yaml';
const statePath = process.argv[3] || '/app/state/state.db';

render(<TuiApp configPath={configPath} statePath={statePath} />);