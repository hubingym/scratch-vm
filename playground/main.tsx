import React from 'react';
import ReactDOM from 'react-dom';
import App from './views/app';

const rootDom = document.getElementById('root');
function renderView() {
  ReactDOM.render(
    <App />,
    rootDom
  );
}

renderView();
