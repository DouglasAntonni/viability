let currentPage = 1;
const rowsPerPage = 20;
let filteredData = [];
let displayedDataCount = 0;
let allData = new Map();
let loading = false;
let dataCache = new Map();
let worker = null;

// Código do Web Worker para filtragem
const workerCode = `
    self.onmessage = function(e) {
        const { searchParams, data } = e.data;
        const { cep, rua, bairro, cidade, numero } = searchParams;

        const filtered = data.filter(row => {
            // Extrair os primeiros 8 dígitos de CEP_NUM
            const cepNum = row.CEP_NUM?.toString().substring(0, 8);

            return (
                (!cep || (cepNum && cepNum.includes(cep))) &&
                (!rua || row.LOGRADOURO?.toLowerCase().includes(rua)) &&
                (!bairro || row.BAIRRO?.toLowerCase().includes(bairro)) &&
                (!cidade || row.CIDADE?.toLowerCase().includes(cidade)) &&
                (!numero || row.NUMERO?.toString().includes(numero))
            );
        });

        self.postMessage(filtered);
    };
`;


const blob = new Blob([workerCode], { type: 'application/javascript' });
worker = new Worker(URL.createObjectURL(blob));

// Função para exibir mensagens de erro
function showError(message) {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `<div style="color: red; padding: 1rem; text-align: center;">${message}</div>`;
}

// Formatar CEP com máscara
function formatCEP(input) {
    return input.replace(/\D/g, '').replace(/(\d{5})(\d)/, '$1-$2');
}

document.getElementById('cep').addEventListener('input', (e) => {
    e.target.value = formatCEP(e.target.value);
});

// Validação do formulário antes da busca
document.getElementById('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const cep = document.getElementById('cep').value.trim().replace(/\D/g, '');
    const rua = document.getElementById('rua').value.trim().toLowerCase();
    const bairro = document.getElementById('bairro').value.trim().toLowerCase();
    const cidade = document.getElementById('cidade').value.trim().toLowerCase();
    const numero = document.getElementById('numero').value.trim();

    if (!cep && !rua && !bairro && !cidade && !numero) {
        showError('Por favor, preencha pelo menos um campo para realizar a busca.');
        return;
    }

    searchAddress();
});

// Inicializa o banco de dados IndexedDB
const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('addressDB', 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('addresses')) {
                db.createObjectStore('addresses', { keyPath: 'id' });
            }
        };
    });
};

// Carregar dados JSON
// Carregar dados de dois arquivos JSON
async function loadJSONData() {
    if (allData.size === 0 && !loading) {
        loading = true;
        const searchBtn = document.getElementById('search-btn');
        searchBtn.disabled = true;

        try {
            // Carregar o primeiro arquivo JSON
            const response1 = await fetch('data.json');
            if (!response1.ok) throw new Error('Erro ao carregar o arquivo JSON 1.');

            const jsonData1 = await response1.json();
            const data1 = jsonData1.Worksheet || [];

            // Carregar o segundo arquivo JSON
            const response2 = await fetch('data2.json');
            if (!response2.ok) throw new Error('Erro ao carregar o arquivo JSON 2.');

            const jsonData2 = await response2.json();
            const data2 = jsonData2.Worksheet || [];

            // Combinar os dados dos dois arquivos
            const combinedData = [...data1, ...data2];

            // Converter o dado combinado para o formato desejado (Map)
            allData = new Map(combinedData.map((item, index) => [index, item]));

        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            showError('Erro ao carregar dados. Por favor, tente novamente.');
        } finally {
            loading = false;
            searchBtn.disabled = false;
        }
    }
}


// Função de busca
async function searchAddress() {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = '<div class="skeleton" style="height: 200px"></div>';

    await loadJSONData();

    const searchParams = {
        cep: document.getElementById('cep').value.trim().replace(/\D/g, '').substring(0, 8),
        rua: document.getElementById('rua').value.trim().toLowerCase(),
        bairro: document.getElementById('bairro').value.trim().toLowerCase(),
        cidade: document.getElementById('cidade').value.trim().toLowerCase(),
        numero: document.getElementById('numero').value.trim().toLowerCase()
    };

    const cacheKey = JSON.stringify(searchParams);

    if (dataCache.has(cacheKey)) {
        filteredData = dataCache.get(cacheKey);
        currentPage = 1;
        displayedDataCount = 0;
        displayPaginatedResults();
    } else {
        worker.postMessage({
            searchParams,
            data: Array.from(allData.values())
        });

        worker.onmessage = function(e) {
            filteredData = e.data;
            dataCache.set(cacheKey, filteredData);
            currentPage = 1;
            displayedDataCount = 0;
            displayPaginatedResults();
        };
    }
}

// Função para exibir resultados paginados
function displayPaginatedResults() {
    const resultDiv = document.getElementById('result');
    const loadMoreBtn = document.getElementById('load-more');

    const startIndex = displayedDataCount;
    const endIndex = Math.min(startIndex + rowsPerPage, filteredData.length);
    const paginatedData = filteredData.slice(startIndex, endIndex);

    if (startIndex === 0) {
        resultDiv.innerHTML = `
            <div class="results-header">
                <h3>Resultados encontrados: ${filteredData.length}</h3>
            </div>
            <table>
                <tr>
                    <th>Viabilidade</th>
                    <th>Cidade</th>
                    <th>Bairro</th>
                    <th>Rua</th>
                    <th>Número</th>
                </tr>
            </table>
        `;
    }

    if (paginatedData.length > 0) {
        const table = resultDiv.querySelector('table');
        paginatedData.forEach(row => {
            const tr = document.createElement('tr');
            const viabilidade = row.RESTRICAO?.toLowerCase() === 'não' ? 'Sim' : 'Não';
            const viabilidadeClass = viabilidade === 'Sim' ? 'sim' : 'nao';

            tr.innerHTML = `
                <td class="${viabilidadeClass}">${viabilidade}</td>
                <td>${row.CIDADE || ''}</td>
                <td>${row.BAIRRO || ''}</td>
                <td>${row.LOGRADOURO || ''}</td>
                <td>${row.NUMERO || ''}</td>
            `;
            table.appendChild(tr);
        });

        displayedDataCount = endIndex;
        loadMoreBtn.style.display = displayedDataCount < filteredData.length ? 'block' : 'none';
    } else {
        resultDiv.innerHTML += "<p class='no-results'>Nenhum resultado encontrado.</p>";
        loadMoreBtn.style.display = 'none';
    }
}

// Evento do botão "Carregar Mais"
document.getElementById('load-more').addEventListener('click', displayPaginatedResults);
