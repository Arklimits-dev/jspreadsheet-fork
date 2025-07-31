import jspreadsheet from './index.js';

import './jspreadsheet.css';
import 'jsuites/dist/jsuites.css';

window.jss = jspreadsheet;

window.instance = jspreadsheet(root, {
    tabs: true,
    toolbar: true,
    worksheets: [{
        data: [
            ['한국어 IME 테스트', '입력 테스트', '결과'],
            ['안녕하세요', '', ''],
            ['한국어 입력', '', ''],
            ['', '', ''],
            ['', '', ''],
            ['', '', ''],
        ],
        columns: [
            { type: 'text', width: 150, title: '한국어' },
            { type: 'text', width: 200, title: 'IME 테스트' }, 
            { type: 'text', width: 150, title: '결과' },
            { type: 'text', width: 100 },
            { type: 'text', width: 100 },
            { type: 'text', width: 100 },
        ],
        minDimensions: [6,6],
    }],
})

