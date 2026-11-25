import { render } from 'preact'
import '@rotur/ui/ui.css'
import './styles/global.css'
import './platform/richtext'
import { App } from './app'

render(<App />, document.getElementById('app')!)
