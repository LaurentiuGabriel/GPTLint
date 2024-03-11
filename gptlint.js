const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const fs = require('fs');
const path = require('path');
const { globSync } = require("glob");

function getFiles(dir, extensions) {
    const pattern = `${dir}/**/*.{${extensions.join(',')}}`;
    const options = {
        ignore: '**/node_modules/**', 
    };
    return globSync(pattern, options);
}

async function staticAnalysis(content) {

    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_KEY}`
    };

    const payload = {
        "model": "gpt-4-0125-preview",
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": `Act as a top static analysis tool for js, ts and tsx foles. I want you to analyze what is in this code. Scan for issues of any type. If everything looks good, just say that, don't make useless suggestion and don't praise the already-well written code. Make sure to keep your answer at the very minimum. Here's the code: ${content}`
                    }
                ]
            }
        ],
        "max_tokens": 1000
    };

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: headers,
            body: JSON.stringify(payload)
        });

        const responseJson = await response.json();

        if (responseJson.choices && responseJson.choices.length > 0 && responseJson.choices[0].message) {
            const messageContent = responseJson.choices[0].message.content;
            return messageContent.split('\n');
        } else {
            console.error('Unexpected response structure:', responseJson);
            return 'Error: Unexpected response structure.';
        }
    } catch (error) {
        console.error("Error during API request:", error);
        throw error;
    }
}

async function createHTMLReport(filePaths) {
    const filesAnalysis = await Promise.all(filePaths.map(async filePath => {
        const content = fs.readFileSync(filePath, 'utf8');
        const analysis = await staticAnalysis(content);
        return { name: filePath, analysis };
    }));

    let html = `<!DOCTYPE html>
    <html>
    <head>
        <title>GPTLint Report</title>
        <style>
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid black; padding: 8px; }
            tr:nth-child(even) { background-color: #f2f2f2; }
            .hidden { display: none; }
        </style>
        <script>
            function toggleVisibility(id) {
                var element = document.getElementById(id);
                if (element.style.display === "none") {
                    element.style.display = "table-row";
                } else {
                    element.style.display = "none";
                }
            }
        </script>
    </head>
    <body>
        <h1>GPTLint Report</h1>
        <table>
            <tr>
                <th>File</th>
            </tr>`;

            function formatAnalysisResult(analysisArray) {
                if (!Array.isArray(analysisArray)) {
                    console.error('Analysis result is not in expected format:', analysisArray);
                    return 'Analysis result is not in the expected format.';
                }
            
                return analysisArray.map(item => {
                    if (item.trim() !== '') {
                        let formattedItem = item.trim()
                            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")  
                            .replace(/`(.*?)`/g, "<code>$1</code>")  
                            .replace(/^###\s?(.*)$/, "<h3>$1</h3>")  
                            .replace(/^##\s?(.*)$/, "<h2>$1</h2>");
            
                        return `<p>${formattedItem}</p>`;  /
                    }
                    return '';  
                }).join('');
            }
            




    filesAnalysis.forEach(file => {
        const formattedAnalysis = formatAnalysisResult(file.analysis);
        html += `<tr>
                            <td><a href="#${file.name}" onclick="toggleVisibility('${file.name}')">${file.name}</a></td>
                         </tr>
                         <tr id="${file.name}" class="hidden">
                            <td>${formattedAnalysis}</td>
                         </tr>`;
    });


    html += `</table>
    </body>
    </html>`;

    fs.writeFileSync('report.html', html);
}

async function main() {
    const targetPath = process.argv[2] || '.'; 
    let files;

    if (fs.existsSync(targetPath)) {
        const stats = fs.statSync(targetPath);
        if (stats.isDirectory()) {
            files = getFiles(targetPath, ['js', 'ts', 'tsx']);
        } else if (stats.isFile()) {
            files = [targetPath];
        } else {
            console.error('The provided path is neither a file nor a directory.');
            return;
        }
    } else {
        console.error('The provided path does not exist.');
        return;
    }

    await createHTMLReport(files);
}

main().catch(console.error);