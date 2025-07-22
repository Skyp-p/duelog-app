document.addEventListener('DOMContentLoaded', () => {
            let localInvoices = []; 
            let currentCategory = 'endOfCurrentMonth';

            const tableBody = document.getElementById('invoice-table-body');
            const navContainer = document.getElementById('due-nav');
            const tableTitle = document.getElementById('table-title');
            
            const addInvoiceModal = document.getElementById('invoice-modal');
            const detailsModal = document.getElementById('details-modal');
            const addInvoiceBtn = document.getElementById('add-invoice-btn');
            const invoiceForm = document.getElementById('invoice-form');

            // --- Firestoreとの通信処理 ---
            
            db.collection("invoices").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
                localInvoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderTable();
            });

            async function addInvoice(invoiceData) {
                try {
                    await db.collection("invoices").add(invoiceData);
                } catch (error) {
                    console.error("Error adding document: ", error);
                }
            }
            
            async function deleteInvoice(id) {
                try {
                    await db.collection("invoices").doc(id).delete();
                } catch (error) {
                    console.error("Error removing document: ", error);
                }
            }

            async function updatePaidStatus(id, newStatus) {
                try {
                    await db.collection("invoices").doc(id).update({ paid: newStatus });
                } catch (error) {
                    console.error("Error updating document: ", error);
                }
            }

            // --- 表示関連の関数 ---

            const getDueDateText = (category) => {
                const now = new Date();
                const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                switch(category) {
                    case 'endOfCurrentMonth': const d = new Date(now.getFullYear(), now.getMonth() + 1, 0); return `${d.getMonth()+1}/${d.getDate()}`;
                    case 'nextMonth20': return `${nextMonth.getMonth()+1}/20`;
                    case 'nextMonthEnd': const e = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0); return `${e.getMonth()+1}/${e.getDate()}`;
                    case 'nextMonth15': return `${nextMonth.getMonth()+1}/15`;
                    default: return '未定';
                }
            };
            const getDueDateLabel = (cat) => cat === 'nextMonth15' ? `${getDueDateText(cat)} (上限超過)` : getDueDateText(cat);
            const categoryTitles = { endOfCurrentMonth: '当月末 期限', nextMonth20: '翌月20日 期限', nextMonthEnd: '翌月末 期限', nextMonth15: '上限超過 (翌月15日)'};
            const determineFinalCategory = (amount, limit, selectedCategory) => (Number(amount) > Number(limit)) ? 'nextMonth15' : selectedCategory;

            const renderTable = () => {
                tableTitle.textContent = categoryTitles[currentCategory];
                document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.category === currentCategory));
                tableBody.innerHTML = '';
                const filteredInvoices = localInvoices
                    .map(inv => ({ ...inv, finalCategory: determineFinalCategory(inv.amount, inv.limit, inv.dueDateCategory) }))
                    .filter(inv => inv.finalCategory === currentCategory);
                
                if(filteredInvoices.length === 0){
                    const row = tableBody.insertRow(); row.style.display = 'block'; const cell = row.insertCell(); cell.colSpan = 6; cell.textContent = 'このカテゴリに該当する請求はありません。'; cell.style.textAlign = 'center'; cell.style.padding = '2rem';
                }else{
                    filteredInvoices.forEach(inv => {
                        const row = tableBody.insertRow(); const isChecked = inv.paid ? 'checked' : '';
                        row.innerHTML = `<td data-label="会社名"><a href="#" class="company-link" data-id="${inv.id}">${inv.companyName}</a></td><td data-label="請求額"><span>¥${Number(inv.amount).toLocaleString()}</span></td><td data-label="銀行"><span>${inv.bank}</span></td><td data-label="振込期限"><span>${getDueDateLabel(inv.finalCategory)}</span></td><td data-label="振込済"><div class="custom-checkbox ${isChecked}" data-id="${inv.id}"><span class="checkmark">✔</span></div></td><td data-label="操作"><button class="action-btn delete" data-id="${inv.id}">削除</button></td>`;
                    });
                }
            };
            
            const showDetailsModal = (id) => {
                const invoice = localInvoices.find(inv => inv.id === id); if (!invoice) return;
                const detailsContent = document.getElementById('details-content');
                const finalCategory = determineFinalCategory(invoice.amount, invoice.limit, invoice.dueDateCategory);
                const commentText = invoice.comment || 'コメントはありません';
                detailsContent.innerHTML = `<dl><dt>会社名</dt><dd>${invoice.companyName}</dd><dt>請求額</dt><dd>¥${Number(invoice.amount).toLocaleString()}</dd><dt>振込上限</dt><dd>¥${Number(invoice.limit).toLocaleString()}</dd><dt>銀行</dt><dd>${invoice.bank}</dd><dt>確定支払日</dt><dd>${getDueDateLabel(finalCategory)}</dd><dt>振込状況</dt><dd>${invoice.paid ? '振込済' : '未振込'}</dd><dt>コメント</dt><dd>${commentText}</dd></dl>`;
                detailsModal.style.display = 'block';
            };

            // --- イベントリスナー ---

            navContainer.addEventListener('click', (e) => {
                if (e.target.classList.contains('nav-btn')) { currentCategory = e.target.dataset.category; renderTable(); }
            });
            
            invoiceForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const newInvoice = {
                    companyName: document.getElementById('company-name').value, amount: parseInt(document.getElementById('payment-amount').value, 10), limit: parseInt(document.getElementById('transfer-limit').value, 10), bank: document.getElementById('bank').value, dueDateCategory: document.getElementById('due-date-select').value, paid: document.getElementById('is-paid').checked, comment: document.getElementById('comment').value.trim(), createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                addInvoice(newInvoice);
                closeModal('invoice-modal');
            });
            
            tableBody.addEventListener('click', (e) => {
                const deleteButton = e.target.closest('.delete');
                const checkbox = e.target.closest('.custom-checkbox');
                const companyLink = e.target.closest('.company-link');

                if (deleteButton) {
                    const id = deleteButton.dataset.id;
                    if (confirm('この請求データを本当に削除しますか？')) { deleteInvoice(id); }
                } else if (checkbox) {
                    const id = checkbox.dataset.id;
                    const invoice = localInvoices.find(inv => inv.id === id);
                    if (invoice) { updatePaidStatus(id, !invoice.paid); }
                } else if (companyLink) {
                    e.preventDefault();
                    showDetailsModal(companyLink.dataset.id);
                }
            });

            // モーダルの開閉
            const openModal = (modalId) => {
                const modal = document.getElementById(modalId);
                if(modal) { if (modalId === 'invoice-modal') invoiceForm.reset(); modal.style.display = 'block'; }
            };
            const closeModal = (modalId) => {
                const modal = document.getElementById(modalId);
                if(modal) modal.style.display = 'none';
            };
            
            addInvoiceBtn.addEventListener('click', () => openModal('invoice-modal'));
            document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', (e) => closeModal(e.target.dataset.targetModal)));
            window.addEventListener('click', (e) => { if (e.target.classList.contains('modal')) closeModal(e.target.id); })
            
        });