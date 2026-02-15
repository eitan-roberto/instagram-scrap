import fs from 'fs';

export function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const posts = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const post = {};
    
    headers.forEach((header, idx) => {
      const key = header.toLowerCase().replace(/\s+/g, '_');
      post[key] = values[idx] || '';
    });
    
    posts.push(post);
  }

  return posts;
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (const char of line) {
    if (char === '"') {
      if (inQuotes && line[values.join('').length + current.length] === '"') {
        current += '"';
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current.trim());
  return values;
}

export function saveCSV(filePath, posts, headers) {
  const lines = [headers.join(',')];
  
  for (const post of posts) {
    const values = headers.map(h => {
      const key = h.toLowerCase().replace(/\s+/g, '_');
      const val = post[key] || '';
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    });
    lines.push(values.join(','));
  }
  
  fs.writeFileSync(filePath, lines.join('\n'));
}
