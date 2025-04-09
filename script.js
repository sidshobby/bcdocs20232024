document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const resultsBody = document.getElementById('resultsBody');
    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const resultsArea = document.getElementById('resultsArea');
    const resultCountDisplay = document.getElementById('resultCount');
    const statisticsDisplay = document.getElementById('statistics');
    const tableHeaders = document.querySelectorAll('#resultsTable th[data-column]');
    
    // Application state
    let allDoctors = []; // Original data, including parsed salary as number and rank
    let filteredDoctors = []; // Currently displayed subset after filtering/sorting
    let currentPage = 1;
    const resultsPerPage = 25; // Increased results per page slightly
    let currentSortColumn = 'salary'; // Default sort by Salary
    let currentSortDirection = 'desc'; // Default sort direction Descending
    let debounceTimer;
    let initialLoadComplete = false;

    // --- Initialization ---
    showLoading();
    fetchDoctorsData();
    setupEventListeners();

    // --- Functions ---

    function showLoading() {
        loadingIndicator.style.display = 'block';
        resultsArea.style.display = 'none';
    }

    function hideLoading() {
        loadingIndicator.style.display = 'none';
        resultsArea.style.display = 'block';
    }

    function fetchDoctorsData() {
        fetch('bcdoctors.csv')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.text();
            })
            .then(data => {
                processCSVData(data);
                calculateRanks(); // Calculate ranks after processing
                filteredDoctors = [...allDoctors]; // Initially, filtered is all
                sortDoctors(); // Apply initial sort to the now populated filteredDoctors
                initialLoadComplete = true;
                displayResults();
                hideLoading();
            })
            .catch(error => {
                console.error('Error fetching or processing data:', error);
                loadingIndicator.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Error loading data. Please check the console or try again later.`;
                loadingIndicator.style.display = 'block';
                resultsArea.style.display = 'none';
            });
    }

    function processCSVData(csvText) {
        const lines = csvText.split('\n');
        allDoctors = []; // Reset
        // Skip header line (i=1)
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '') continue;
            
            let currentLine = lines[i].trim();
            let name = '';
            let salaryString = '';

            // Improved parsing for "LastName, FirstName","Salary"
            const match = currentLine.match(/^"([^"].*[^\"])"\s*,\s*"([^\"]*)"$/);
            if (match && match.length === 3) {
                name = match[1].replace(/""/g, '"'); // Handle escaped quotes within name if necessary
                salaryString = match[2];
            } else {
                // Fallback for potentially unquoted or differently quoted lines
                const parts = currentLine.split(',');
                if (parts.length >= 2) {
                    name = parts[0].trim().replace(/^"|"$/g, ''); // Trim and remove potential surrounding quotes
                    salaryString = parts.slice(1).join(',').trim().replace(/^"|"$/g, '');
                } else {
                    console.warn("Could not parse line:", currentLine);
                    continue; // Skip this line
                }
            }

            // Convert salary to number for sorting/stats
            const salary = parseFloat(salaryString.replace(/,/g, ''));

            if (name && !isNaN(salary)) {
                allDoctors.push({
                    name: name,
                    salary: salary,
                    salaryFormatted: `$${salary.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, // Store formatted salary
                    rank: 0 // Placeholder for rank
                });
            } else {
                console.warn("Skipping line due to parsing issue or invalid salary:", currentLine);
            }
        }
        console.log(`Processed ${allDoctors.length} doctor records.`);
    }

    function calculateRanks() {
        // Sort by salary descending to calculate rank
        const sortedBySalary = [...allDoctors].sort((a, b) => b.salary - a.salary);
        let currentRank = 0;
        let lastSalary = -1;
        let doctorsAtSameRank = 0;

        sortedBySalary.forEach((doctor, index) => {
            if (doctor.salary !== lastSalary) {
                currentRank += doctorsAtSameRank + 1;
                doctorsAtSameRank = 0; 
                lastSalary = doctor.salary;
            } else {
                doctorsAtSameRank++;
            }
            // Find the original doctor object and assign the rank
            const originalDoctor = allDoctors.find(d => d.name === doctor.name && d.salary === doctor.salary);
            if (originalDoctor) {
                originalDoctor.rank = currentRank;
            }
        });
    }

    function setupEventListeners() {
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                performSearch();
            }, 300); // 300ms debounce
        });

        clearSearchBtn.addEventListener('click', () => {
            searchInput.value = '';
            performSearch(); // Re-run search with empty term
        });

        prevPageBtn.addEventListener('click', goToPrevPage);
        nextPageBtn.addEventListener('click', goToNextPage);

        tableHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const column = header.getAttribute('data-column');
                if (currentSortColumn === column) {
                    currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    currentSortColumn = column;
                    currentSortDirection = column === 'salary' || column === 'rank' ? 'desc' : 'asc'; // Default salary/rank desc
                }
                sortDoctors();
                currentPage = 1; // Reset to first page after sort
                displayResults();
                updateSortIcons();
            });
        });
    }

    function performSearch() {
        const searchTerm = searchInput.value.toLowerCase().trim();
        clearSearchBtn.style.display = searchTerm ? 'block' : 'none'; // Show/hide clear button

        if (!initialLoadComplete) return; // Don't search if data isn't loaded

        if (searchTerm === '') {
            filteredDoctors = [...allDoctors];
        } else {
            filteredDoctors = allDoctors.filter(doctor => {
                const doctorNameLower = doctor.name.toLowerCase();
                
                // Direct match check
                if (doctorNameLower.includes(searchTerm)) {
                    return true;
                }

                // "FirstName LastName" style match check
                const nameParts = doctor.name.split(',');
                if (nameParts.length >= 2) {
                    const lastName = nameParts[0].trim().toLowerCase();
                    const firstNameParts = nameParts.slice(1).join(',').trim().toLowerCase();
                    const firstWordOfFirstName = firstNameParts.split(' ')[0];
                    if (searchTerm.includes(lastName) && searchTerm.includes(firstWordOfFirstName)) {
                        return true;
                    }
                }
                return false;
            });
        }

        sortDoctors(); // Re-apply current sort to filtered results
        currentPage = 1; // Reset page after search
        displayResults();
    }

    function sortDoctors() {
        filteredDoctors.sort((a, b) => {
            let valA, valB;

            if (currentSortColumn === 'name') {
                valA = a.name.toLowerCase();
                valB = b.name.toLowerCase();
            } else if (currentSortColumn === 'salary') {
                valA = a.salary;
                valB = b.salary;
            } else if (currentSortColumn === 'rank') {
                valA = a.rank;
                valB = b.rank;
            }

            if (valA < valB) return currentSortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return currentSortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }

    function displayResults() {
        const startIndex = (currentPage - 1) * resultsPerPage;
        const endIndex = startIndex + resultsPerPage;
        const displayedDoctors = filteredDoctors.slice(startIndex, endIndex);
        const searchTerm = searchInput.value.trim().toLowerCase();

        resultsBody.innerHTML = ''; // Clear previous results

        if (filteredDoctors.length === 0) {
            resultsBody.innerHTML = `<tr><td colspan="3">No results found${searchTerm ? ' for "' + escapeHTML(searchInput.value) + '"' : ''}.</td></tr>`;
        } else {
            displayedDoctors.forEach(doctor => {
                const row = document.createElement('tr');
                
                const nameCell = document.createElement('td');
                nameCell.innerHTML = highlightSearchTerm(doctor.name, searchTerm);
                row.appendChild(nameCell);
                
                const salaryCell = document.createElement('td');
                salaryCell.textContent = doctor.salaryFormatted;
                row.appendChild(salaryCell);

                const rankCell = document.createElement('td');
                rankCell.textContent = doctor.rank;
                row.appendChild(rankCell);
                
                resultsBody.appendChild(row);
            });
        }
        
        updatePagination();
        updateStatistics();
        updateResultCount();
        updateSortIcons(); // Ensure icons are correct on display
    }
    
    function updatePagination() {
        const totalItems = filteredDoctors.length;
        const totalPages = Math.ceil(totalItems / resultsPerPage);
        
        if (totalItems === 0) {
             pageInfo.textContent = 'Page 0 of 0';
        } else {
             pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        }
        
        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;

        // Hide pagination if only one page or no results
        document.getElementById('pagination').style.display = totalPages <= 1 ? 'none' : 'flex';
    }
    
    function updateStatistics() {
        if (filteredDoctors.length === 0) {
            statisticsDisplay.innerHTML = 'N/A';
            return;
        }

        const salaries = filteredDoctors.map(d => d.salary);
        const sum = salaries.reduce((acc, val) => acc + val, 0);
        const avg = sum / salaries.length;
        const min = Math.min(...salaries);
        const max = Math.max(...salaries);

        // Calculate median
        const sortedSalaries = [...salaries].sort((a, b) => a - b);
        const mid = Math.floor(sortedSalaries.length / 2);
        const median = sortedSalaries.length % 2 !== 0
            ? sortedSalaries[mid]
            : (sortedSalaries[mid - 1] + sortedSalaries[mid]) / 2;

        const formatCurrency = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        statisticsDisplay.innerHTML = `
            <span>Avg: ${formatCurrency(avg)}</span> | 
            <span>Median: ${formatCurrency(median)}</span> | 
            <span>Min: ${formatCurrency(min)}</span> | 
            <span>Max: ${formatCurrency(max)}</span>
        `;
    }

    function updateResultCount() {
        const totalFiltered = filteredDoctors.length;
        const totalOverall = allDoctors.length;
        const searchTerm = searchInput.value.trim();

        if (searchTerm) {
            resultCountDisplay.textContent = `Found ${totalFiltered} result(s) matching "${escapeHTML(searchTerm)}"`;
        } else {
            resultCountDisplay.textContent = `Showing ${totalFiltered} of ${totalOverall} records`;
        }
    }

    function updateSortIcons() {
        tableHeaders.forEach(header => {
            const column = header.getAttribute('data-column');
            header.classList.remove('sorted-asc', 'sorted-desc');
            if (column === currentSortColumn) {
                header.classList.add(currentSortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
            }
        });
    }

    function highlightSearchTerm(text, term) {
        if (!term) return escapeHTML(text);
        const escapedTerm = escapeRegExp(term);
        const regex = new RegExp(`(${escapedTerm})`, 'gi');
        return escapeHTML(text).replace(regex, '<span class="highlight">$1</span>');
    }

    function escapeHTML(str) {
        return str.replace(/[&<>'"/]/g, function (s) {
            const entityMap = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
                '/': '&#x2F;'
            };
            return entityMap[s];
        });
    }
    
     function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
    }

    function goToPrevPage() {
        if (currentPage > 1) {
            currentPage--;
            displayResults();
            window.scrollTo(0, 0); // Scroll to top
        }
    }
    
    function goToNextPage() {
        const totalPages = Math.ceil(filteredDoctors.length / resultsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            displayResults();
            window.scrollTo(0, 0); // Scroll to top
        }
    }
}); 