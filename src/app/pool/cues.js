/** 球杆款式是球杆本身的颜色，不是界面主题色。 */

const CUE_STYLES = [
  { id: 'maple', name: '枫木经典', shaft: '#c98445', tip: '#1f6ea8', butt: '#6b3a22' },
  { id: 'ebony', name: '乌木', shaft: '#3a342c', tip: '#f4f1ea', butt: '#16130f' },
  { id: 'rosewood', name: '红木', shaft: '#8d3d2f', tip: '#e7c56a', butt: '#4a2218' },
  { id: 'bamboo', name: '翠竹', shaft: '#3d7a52', tip: '#f7f4ee', butt: '#1e4630' }
];

function cueStyle(id) {
  return CUE_STYLES.find(item => item.id === id) || CUE_STYLES[0];
}

module.exports = { CUE_STYLES, cueStyle };
