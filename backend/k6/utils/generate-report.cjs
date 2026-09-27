const fs = require('fs');
const path = require('path');

// Ensure results directory exists
const resultsDir = path.join(__dirname, '../results');
if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
}

const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('.json') && !f.includes('summary'));

if (files.length === 0) {
    console.log('\n⚠️  No results found. Run a test with --out json first.');
    console.log('Example: k6 run --out json=k6/results/results.json k6/load-test.js\n');
    process.exit(0);
}

// Get the most recent result file
const latestFile = files.sort().reverse()[0];
const resultPath = path.join(resultsDir, latestFile);

console.log(`\n📊 Generating report from: ${latestFile}\n`);

// Parse NDJSON (newline-delimited JSON) format from k6
let metrics = {};
let checks = [];

try {
    const fileContent = fs.readFileSync(resultPath, 'utf8');
    const lines = fileContent.trim().split('\n');
    
    // Process each line
    for (const line of lines) {
        try {
            const obj = JSON.parse(line);
            
            // Collect metric definitions and data points
            if (obj.type === 'Metric') {
                if (!metrics[obj.data.name]) {
                    metrics[obj.data.name] = {
                        name: obj.data.name,
                        type: obj.data.type,
                        values: { count: 0, sum: 0, min: Infinity, max: -Infinity }
                    };
                }
            } else if (obj.type === 'Point' && obj.data) {
                const metricName = obj.metric;
                if (!metrics[metricName]) {
                    metrics[metricName] = {
                        name: metricName,
                        values: { count: 0, sum: 0, min: Infinity, max: -Infinity, values: [] }
                    };
                }
                
                const value = obj.data.value;
                metrics[metricName].values.count++;
                metrics[metricName].values.sum += value;
                metrics[metricName].values.min = Math.min(metrics[metricName].values.min, value);
                metrics[metricName].values.max = Math.max(metrics[metricName].values.max, value);
                
                // Store values for percentile calculation
                if (!metrics[metricName].values.values) {
                    metrics[metricName].values.values = [];
                }
                metrics[metricName].values.values.push(value);
            }
        } catch (e) {
            // Skip invalid lines
        }
    }
    
    // Calculate averages and percentiles
    for (const [name, metric] of Object.entries(metrics)) {
        if (metric.values.count > 0) {
            metric.values.avg = metric.values.sum / metric.values.count;
            
            // Calculate percentiles if we have values
            if (metric.values.values && metric.values.values.length > 0) {
                const sorted = metric.values.values.sort((a, b) => a - b);
                metric.values['p(90)'] = percentile(sorted, 90);
                metric.values['p(95)'] = percentile(sorted, 95);
                metric.values['p(99)'] = percentile(sorted, 99);
            }
        }
    }
    
} catch (error) {
    console.error('❌ Error parsing results file:', error.message);
    process.exit(1);
}

function percentile(sorted, p) {
    const index = Math.ceil((sorted.length * p) / 100) - 1;
    return sorted[Math.max(0, index)];
}

// Generate HTML report
const html = `
<!DOCTYPE html>
<html>
<head>
    <title>k6 Performance Test Results - MaxiStore</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            color: #333;
        }
        .container { 
            max-width: 1400px; 
            margin: 0 auto; 
            background: white; 
            padding: 40px; 
            border-radius: 12px; 
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 { 
            color: #667eea;
            font-size: 2.5em;
            margin-bottom: 10px;
            border-bottom: 4px solid #667eea;
            padding-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 15px;
        }
        .meta {
            color: #666;
            margin-bottom: 30px;
            font-size: 0.95em;
            line-height: 1.6;
        }
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin: 30px 0;
        }
        .metric { 
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            padding: 25px; 
            border-radius: 8px;
            border-left: 5px solid #667eea;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .metric:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 20px rgba(0,0,0,0.1);
        }
        .metric h3 { 
            color: #555;
            font-size: 0.9em;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 10px;
        }
        .value { 
            font-size: 2em;
            font-weight: bold;
            color: #667eea;
        }
        .pass { color: #4CAF50; }
        .fail { color: #f44336; }
        .warn { color: #ff9800; }
        h2 {
            color: #667eea;
            margin: 40px 0 20px 0;
            font-size: 1.8em;
            border-bottom: 2px solid #eee;
            padding-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 20px 0;
            background: white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            border-radius: 8px;
            overflow: hidden;
        }
        th, td { 
            padding: 15px; 
            text-align: left; 
        }
        th { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            font-weight: 600;
            text-transform: uppercase;
            font-size: 0.85em;
            letter-spacing: 0.5px;
        }
        tr:nth-child(even) { background-color: #f8f9fa; }
        tr:hover { background-color: #e9ecef; }
        td { border-bottom: 1px solid #dee2e6; }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #eee;
            text-align: center;
            color: #888;
            font-size: 0.9em;
        }
        .status-badge {
            display: inline-block;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 0.85em;
            font-weight: 600;
        }
        .badge-pass { background: #d4edda; color: #155724; }
        .badge-fail { background: #f8d7da; color: #721c24; }
        .emoji { font-size: 1.2em; }
    </style>
</head>
<body>
    <div class="container">
        <h1>
            <span class="emoji">🚀</span>
            MaxiStore Performance Test Results
        </h1>
        <div class="meta">
            <p><strong>Test Run:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>Data File:</strong> ${latestFile}</p>
            <p><strong>Total Metrics Collected:</strong> ${Object.keys(metrics).length}</p>
        </div>
        
        <h2><span class="emoji">📊</span> Key Metrics</h2>
        <div class="metrics-grid">
            ${generateMetricCards(metrics)}
        </div>

        <h2><span class="emoji">📈</span> Detailed Performance Metrics</h2>
        <table>
            <thead>
                <tr>
                    <th>Metric</th>
                    <th>Average</th>
                    <th>Min</th>
                    <th>Max</th>
                    <th>p90</th>
                    <th>p95</th>
                    <th>p99</th>
                </tr>
            </thead>
            <tbody>
                ${generateMetricRows(metrics)}
            </tbody>
        </table>

        <div class="footer">
            <p><strong>Generated by k6 Performance Testing Suite</strong></p>
            <p>MaxiStore Backend - ${new Date().getFullYear()}</p>
        </div>
    </div>
</body>
</html>
`;

function generateMetricCards(metrics) {
    const cards = [];
    
    // Total Requests
    if (metrics.http_reqs && metrics.http_reqs.values) {
        cards.push(`
            <div class="metric">
                <h3>Total Requests</h3>
                <div class="value">${metrics.http_reqs.values.count.toLocaleString()}</div>
            </div>
        `);
    }
    
    // Average Response Time
    if (metrics.http_req_duration && metrics.http_req_duration.values) {
        cards.push(`
            <div class="metric">
                <h3>Avg Response Time</h3>
                <div class="value">${metrics.http_req_duration.values.avg.toFixed(2)} ms</div>
            </div>
        `);
    }
    
    // p95 Response Time
    if (metrics.http_req_duration && metrics.http_req_duration.values && metrics.http_req_duration.values['p(95)']) {
        const p95 = metrics.http_req_duration.values['p(95)'];
        const statusClass = p95 > 1000 ? 'fail' : p95 > 500 ? 'warn' : 'pass';
        cards.push(`
            <div class="metric">
                <h3>p95 Response Time</h3>
                <div class="value ${statusClass}">${p95.toFixed(2)} ms</div>
            </div>
        `);
    }
    
    // Throughput (requests per second)
    if (metrics.http_reqs && metrics.http_req_duration && metrics.http_req_duration.values) {
        const totalTime = metrics.http_req_duration.values.sum / 1000; // Convert to seconds
        const rps = metrics.http_reqs.values.count / totalTime;
        cards.push(`
            <div class="metric">
                <h3>Throughput</h3>
                <div class="value">${rps.toFixed(2)} req/s</div>
            </div>
        `);
    }
    
    return cards.length > 0 ? cards.join('') : '<div class="metric"><p>No key metrics available</p></div>';
}

function generateMetricRows(metrics) {
    const rows = [];
    const metricsToShow = [
        'http_req_duration',
        'http_req_waiting',
        'http_req_connecting',
        'http_req_blocked',
        'http_req_sending',
        'http_req_receiving'
    ];
    
    for (const name of metricsToShow) {
        if (metrics[name] && metrics[name].values) {
            const v = metrics[name].values;
            rows.push(`
                <tr>
                    <td><strong>${name.replace(/_/g, ' ')}</strong></td>
                    <td>${(v.avg || 0).toFixed(2)} ms</td>
                    <td>${(v.min || 0).toFixed(2)} ms</td>
                    <td>${(v.max || 0).toFixed(2)} ms</td>
                    <td>${(v['p(90)'] || 0).toFixed(2)} ms</td>
                    <td>${(v['p(95)'] || 0).toFixed(2)} ms</td>
                    <td>${(v['p(99)'] || 0).toFixed(2)} ms</td>
                </tr>
            `);
        }
    }
    
    return rows.length > 0 ? rows.join('') : '<tr><td colspan="7">No timing metrics found</td></tr>';
}

const reportPath = path.join(resultsDir, 'report.html');
fs.writeFileSync(reportPath, html);

console.log(`✅ HTML report generated: ${reportPath}\n`);
console.log(`To view the report, run:`);
console.log(`   start ${reportPath}\n`);