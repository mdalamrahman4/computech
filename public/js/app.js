// Helper function for consistent fetch behavior
async function getJSON(url) {
  const res = await fetch(url, { 
    credentials: 'include',      // CRITICAL: Include cookies in request
    cache: 'no-store'            // Don't cache requests
  });
  return res.json();
}

async function postJSON(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',      // CRITICAL: Include cookies in request
    cache: 'no-store',           // Don't cache requests
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}


// Notification system
function showNotification(message, type = 'info') {
  // Remove existing notifications
  document.querySelectorAll('.notification').forEach(note => note.remove());
  
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      <span class="notification-message">${message}</span>
      <button class="notification-close">&times;</button>
    </div>
  `;
  
  // Add to document
  document.body.appendChild(notification);
  
  // Add close button functionality
  notification.querySelector('.notification-close').onclick = () => notification.remove();
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    notification.classList.add('notification-hiding');
    setTimeout(() => notification.remove(), 500);
  }, 5000);
}

// Function to close any open modals
function closeAllModals() {
  // Close any stats modal that might be open
  document.querySelectorAll('.modal').forEach(modal => {
    if (modal && modal.id !== 'paymentModal') {
      modal.classList.remove('active');
      setTimeout(() => modal.remove(), 300);
    }
  });
  
  // Close payment modal if it's open
  const paymentModal = document.getElementById('paymentModal');
  if (paymentModal && paymentModal.style.display === 'flex') {
    closeModal();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Session & Nav toggling
  let role = null;
  try {
    ({ role } = await (await fetch('/api/auth/status', { credentials: 'include' })).json());
  } catch { /* silent */ }

  const signUpLink = document.querySelector('nav a[href$="signup.html"]');
  const loginLink  = document.querySelector('nav a[href$="login.html"]');
  const logoutBtn  = document.getElementById('logoutBtn');

  if (role) {
    signUpLink?.style.setProperty('display','none');
    loginLink?.style.setProperty('display','none');
    logoutBtn?.style.setProperty('display','inline-block');
  } else {
    signUpLink?.style.removeProperty('display');
    loginLink?.style.removeProperty('display');
    logoutBtn?.style.setProperty('display','none');
  }

  logoutBtn?.addEventListener('click', async () => {
    await postJSON('/api/auth/logout', {});
    window.location.href = '/login.html';
  });

  // Signup
  document.getElementById('signupForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const res = await postJSON('/api/auth/signup', Object.fromEntries(new FormData(e.target)));
    showNotification(res.message || res.error, res.message ? 'success' : 'error');
    if (res.message) window.location.href = '/login.html';
  });

  // Login
  document.getElementById('loginForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const creds = Object.fromEntries(new FormData(e.target));
  
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST', 
      credentials: 'include',     // CRITICAL: Include cookies
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds)
    });
    
    const js = await r.json();
    
    if (!r.ok) {
      return showNotification(js.error || 'Login failed', 'error');
    }
    
    // Store admin status in localStorage as a backup
    localStorage.setItem('userRole', js.role);
    
    // Navigation must happen via full page load
    window.location.href = js.role === 'admin' ? '/admin.html' : '/dashboard.html';
  } catch (err) {
    console.error('Login error:', err);
    showNotification('Login failed. Please try again.', 'error');
  }
});


  // Page load
  if (location.pathname.endsWith('dashboard.html')) loadDashboard();
  else if (location.pathname.endsWith('admin.html')) loadAdmin();

  // Scroll Reveal
  const els = [...document.querySelectorAll('form, table, section, main section')];
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) e.target.classList.add('animate','active'), obs.unobserve(e.target);
    });
  },{threshold:0.15});
  els.forEach(el => (el.classList.add('reveal'), obs.observe(el)));
  
  // Set up the close button on the payment modal
  const closeBtn = document.querySelector('#paymentModal .close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }
  
  // Set up coupon form submission
  document.getElementById('refForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      const res = await postJSON('/api/admin/referral', data);
      if (res.error) {
        showNotification(res.error, 'error');
      } else {
        showNotification('Discount coupon created successfully', 'success');
        e.target.reset();
        await loadAdmin();
      }
    } catch (err) {
      console.error('Failed to create coupon:', err);
      showNotification('Failed to create coupon', 'error');
    }
  });
});

// Student Dashboard
async function loadDashboard() {
  try {
    const data = await getJSON('/api/student/me');
    if (data.error) return window.location.href='/login.html';

    document.getElementById('stuRoll').innerText = data.student.rollNo;
    document.getElementById('stuName').innerText = data.student.name;
    document.getElementById('stuEmail').innerText = data.student.email;
    document.getElementById('stuClass').innerText = data.student.class;
    document.getElementById('stuBoard').innerText = data.student.board;
    document.getElementById('stuRef').innerText = data.student.referralCode || '-';

    // Remove any existing referral information to prevent duplication
    const existingRefInfo = document.getElementById('referralInfo');
    if (existingRefInfo) {
      existingRefInfo.remove();
    }
    
    // Display referral count and available discount
    const referralCount = data.referralCount || 0;
    if (referralCount > 0) {
      const referralElement = document.createElement('p');
      referralElement.id = 'referralInfo'; // Add ID to prevent duplication
      referralElement.innerHTML = `Referrals Made: <span>${referralCount}</span> <em>(₹${data.student.referralDiscount} one-time discount available for your next payment)</em>`;
      
      // Add referral information after the referral code
      const refCodeElement = document.getElementById('stuRef').parentElement;
      refCodeElement.insertAdjacentElement('afterend', referralElement);
    }

    const tbody = document.getElementById('monthBody');
    tbody.innerHTML = '';
    data.months.forEach((m, idx) => {
      let action = '';
      if (m.status === 'unpaid') {
        // Changed from monthlyDiscount to referralDiscount
        const discount = idx === 0
          ? (data.student.signupDiscount || 0)
          : (data.student.referralDiscount || 0);
        const price = 600 - discount;
        action = `<button onclick="payMonth('${m.month}',${discount})">Pay ₹${price}</button>`;
      } else if (m.status === 'pending') {
        action = `<button onclick="cancelPayment('${m.paymentId}')">Cancel</button>`;
      }
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${m.month}</td><td>${m.status}</td><td>${action}</td>`;
      tbody.appendChild(tr);
    });
  } catch (error) {
    console.error('Error in loadDashboard:', error);
    showNotification('Error loading dashboard', 'error');
  }
}

// Validates a coupon code
async function validateCoupon() {
  const couponInput = document.getElementById('discountCoupon');
  const couponMessage = document.getElementById('couponMessage');
  const code = couponInput.value.trim();
  
  if (!code) {
    couponMessage.innerHTML = '<span style="color:red">Please enter a coupon code</span>';
    return;
  }
  
  couponMessage.innerHTML = '<span style="color:blue">Validating...</span>';
  
  try {
    const response = await fetch(`/api/student/coupon/${code}`, { credentials: 'include' });
    const data = await response.json();
    
    if (response.ok) {
      const currentAmount = parseInt(document.getElementById('payAmount').textContent.replace('₹', ''));
      const newAmount = currentAmount - data.discount;
      document.getElementById('payAmount').textContent = `₹${newAmount}`;
      
      couponMessage.innerHTML = `<span style="color:green">Coupon applied! ₹${data.discount} discount.</span>`;
    } else {
      couponMessage.innerHTML = `<span style="color:red">${data.error}</span>`;
    }
  } catch (err) {
    console.error('Coupon validation error:', err);
    couponMessage.innerHTML = '<span style="color:red">Failed to validate coupon</span>';
  }
}

// Function to open the payment modal
function payMonth(month, discount) {
  const modal = document.getElementById('paymentModal');
  const monthLabel = document.getElementById('payMonth');
  const amountLabel = document.getElementById('payAmount');
  const discountField = document.getElementById('discountAmount');
  
  // Reset form and clear any previous data
  document.getElementById('paymentForm').reset();
  document.getElementById('discountCoupon').value = '';
  document.getElementById('couponMessage').innerHTML = '';
  
  // Hide screenshot field by default until payment method is selected
  document.getElementById('screenshotField').style.display = 'none';
  document.getElementById('cashNoteField').style.display = 'none';
  
  // Set month and amount information
  monthLabel.textContent = month;
  amountLabel.textContent = `₹${600 - discount}`;
  discountField.value = discount || 0;
  
  // Show the modal with animation
  modal.style.display = 'flex';
  setTimeout(() => {
    modal.classList.add('active');
  }, 10);
}
async function loadStudents(search = '') {
  try {
    const url = search
      ? `/api/admin/students/search?q=${encodeURIComponent(search)}`
      : '/api/admin/students';
    const students = await getJSON(url);
    const tbody = document.getElementById('studentsList');
    tbody.innerHTML = '';
    students.forEach(student => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-label="Roll No">${student.rollNo}</td>
        <td data-label="Name">${student.name}</td>
        <td data-label="Class">${student.class}</td>
        <td data-label="Board">${student.board}</td>
        <td data-label="School">${student.school}</td>
        <td data-label="Last Payment">${
          student.lastPayment ? new Date(student.lastPayment).toLocaleDateString() : 'None'
        }</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    showNotification('Failed to load students', 'error');
  }
}

// Function to update UI based on selected payment method
function updatePaymentMethod() {
  const method = document.querySelector('input[name="paymentMethod"]:checked')?.value;
  const screenshotField = document.getElementById('screenshotField');
  const cashNoteField = document.getElementById('cashNoteField');
  
  if (method === 'cash') {
    screenshotField.style.display = 'none';
    cashNoteField.style.display = 'block';
  } else if (method === 'upi' || method === 'bank') {
    screenshotField.style.display = 'block';
    cashNoteField.style.display = 'none';
  }
}

// Function to handle closing the payment modal
function closeModal() {
  const modal = document.getElementById('paymentModal');
  modal.classList.remove('active');
  setTimeout(() => {
    modal.style.display = 'none';
  }, 300);
}

// Function to handle payment form submission
async function submitPayment() {
  const submitBtn = document.querySelector('#paymentForm button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = "Processing...";
  submitBtn.disabled = true;

  try {
    const month = document.getElementById('payMonth').textContent;
    const method = document.querySelector('input[name="paymentMethod"]:checked')?.value;
    const screenshot = document.getElementById('paymentScreenshot').files[0];
    const discountCoupon = document.getElementById('discountCoupon').value;
    const signupDiscount = document.getElementById('discountAmount').value;
    
    if (!method) {
      showNotification('Please select a payment method', 'warning');
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
      return;
    }
    
    // Only require screenshot for non-cash payments
    if (!screenshot && method !== 'cash') {
      showNotification('Please upload a screenshot of your payment', 'warning');
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
      return;
    }
    
    const formData = new FormData();
    formData.append('month', month);
    formData.append('method', method);
    if (screenshot) formData.append('screenshot', screenshot);
    if (discountCoupon) formData.append('discountCoupon', discountCoupon);
    formData.append('signupDiscount', signupDiscount || 0);
    
    const response = await fetch('/api/student/pay', {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    if (data.error) {
      showNotification(data.error, 'error');
    } else {
      // Different message based on payment method
      if (method === 'cash') {
        showNotification(`Cash payment of ₹${data.amount} requested. Please bring cash to the institute within 2 days.`, 'success');
      } else {
        showNotification(`Payment of ₹${data.amount} requested. Admin will verify soon.`, 'success');
      }
      
      // Close modal with animation
      closeModal();
      
      // Critical: Refresh dashboard to show updated payment status
      await loadDashboard();
    }
  } catch (err) {
    console.error('Payment submission error:', err);
    showNotification('Payment request failed. Please try again.', 'error');
  } finally {
    // Reset button state
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

// Function to cancel a payment
async function cancelPayment(id) {
  confirmAction('Are you sure you want to cancel this payment request?', async () => {
    try {
      const response = await fetch(`/api/student/pay/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (data.error) {
        showNotification(data.error, 'error');
      } else {
        showNotification('Payment request cancelled', 'success');
        await loadDashboard();
      }
    } catch (err) {
      console.error('Failed to cancel payment:', err);
      showNotification('Failed to cancel payment', 'error');
    }
  });
}

// Admin Panel
async function loadAdmin() {
  try {
    // Close any modal windows that might be open
    closeAllModals();
    
    // Pending students
    const studs = await getJSON('/api/admin/students/pending');
    const sb1 = document.getElementById('studentsBody');
    sb1.innerHTML = '';
    
    if (studs.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="6" style="text-align: center;">No pending students</td>`;
      sb1.appendChild(tr);
    } else {
      studs.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${s.rollNo}</td>
          <td>${s.name}</td>
          <td>${s.email}</td>
          <td>${s.class}</td>
          <td>${s.board}</td>
          <td>
            <button class="btn btn-success" onclick="approveStudent('${s._id}')">Approve</button>
            <button class="btn btn-danger" onclick="deleteStudent('${s._id}')">Delete</button>
          </td>`;
        sb1.appendChild(tr);
      });
    }

    // Payments
    await loadPayments();

    // Discount coupons table
    const refs = await getJSON('/api/admin/referral');
    const sb3 = document.getElementById('referralBody');
    sb3.innerHTML = '';
    
    if (refs.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="4" style="text-align: center;">No coupons created</td>`;
      sb3.appendChild(tr);
    } else {
      refs.forEach(r => {
        if (r.type === 'admin') { // Only show admin coupons
          const creator = 'Admin';
          const referred = r.usedByName ? `${r.usedByName} (${r.usedBy})` : '-';
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${r.code}</td>
            <td>₹${r.discount}</td>
            <td>${creator}</td>
            <td>${referred}</td>
          `;
          sb3.appendChild(tr);
        }
      });
    }

    // Monthly stats
    await loadStats();
  } catch (error) {
    console.error('Error loading admin panel:', error);
    showNotification('Error loading admin data', 'error');
  }
}

// Function to load monthly stats
async function loadStats() {
  try {
    const stats = await getJSON('/api/admin/monthly-stats');
    const sb4 = document.getElementById('statsBody');
    sb4.innerHTML = '';
    
    if (stats.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="3" style="text-align: center;">No payment data available</td>`;
      sb4.appendChild(tr);
    } else {
      stats.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${s.month}</td>
          <td>${s.count}</td>
          <td><button class="btn" onclick="viewStats('${s.month}')">View</button></td>
        `;
        sb4.appendChild(tr);
      });
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
    showNotification('Failed to load monthly statistics', 'error');
  }
}

// Function to load payments in admin panel
async function loadPayments() {
  try {
    const payments = await getJSON('/api/admin/payments');
    const tbody = document.getElementById('paymentsBody');
    
    // Check if element exists before manipulating it
    if (!tbody) {
      console.error('Payments table body not found in the DOM');
      return;
    }
    
    tbody.innerHTML = '';
    
    if (payments.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="7" style="text-align: center;">No payment requests</td>`;
      tbody.appendChild(tr);
      return;
    }
    
    payments.forEach(p => {
      const tr = document.createElement('tr');
      
      // Format the date nicely
      const date = new Date(p.date).toLocaleDateString('en-US', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
      
      // Create action buttons with confirmation dialogs
      let actions = '';
      if (p.approved) {
        actions = '<span class="badge success">Approved</span>';
      } else {
        actions = `
          <button class="btn btn-success" onclick="confirmAction('Are you sure you want to approve this payment?', () => approvePayment('${p._id}'))">Approve</button>
          <button class="btn btn-danger" onclick="confirmAction('Are you sure you want to reject this payment?', () => rejectPayment('${p._id}'))">Reject</button>
        `;
      }
      
      const receiptBtn = p.screenshot ? 
        `<button class="btn" onclick="downloadReceipt('${p.screenshot}')">View</button>` : 
        'None';
      
      tr.innerHTML = `
        <td>${p.studentRoll}</td>
        <td>${p.studentName}</td>
        <td>${date}</td>
        <td>${p.method}</td>
        <td>₹${p.amount}</td>
        <td>${actions}</td>
        <td>${receiptBtn}</td>
      `;
      
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Failed to load payments:', err);
    showNotification('Failed to load payments', 'error');
  }
}

// Function to download/view receipt
function downloadReceipt(filename) {
  // Open the receipt in a new tab
  window.open(`/api/admin/receipts/${filename}`, '_blank');
}

// Admin actions
async function approveStudent(id) {
  confirmAction('Are you sure you want to approve this student?', async () => {
    try {
      const data = await postJSON(`/api/admin/students/approve/${id}`, {});
      showNotification('Student approved successfully', 'success');
      await loadAdmin();
    } catch (err) {
      console.error('Failed to approve student:', err);
      showNotification('Failed to approve student', 'error');
    }
  });
}

async function deleteStudent(id) {
  confirmAction('Are you sure you want to delete this student?', async () => {
    try {
      await fetch(`/api/admin/students/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      showNotification('Student deleted successfully', 'success');
      await loadAdmin();
    } catch (err) {
      console.error('Failed to delete student:', err);
      showNotification('Failed to delete student', 'error');
    }
  });
}

async function approvePayment(id) {
  try {
    const data = await postJSON(`/api/admin/payments/approve/${id}`, {});
    showNotification('Payment approved successfully', 'success');
    await loadPayments();
    await loadStats(); // Refresh stats after approving payment
  } catch (err) {
    console.error('Failed to approve payment:', err);
    showNotification('Failed to approve payment', 'error');
  }
}

// Function to handle payment rejection
async function rejectPayment(paymentId) {
  try {
    const response = await fetch(`/api/admin/payments/${paymentId}/reject`, {
      method: 'POST',
      credentials: 'include' // Add this to ensure cookies are sent
    });
    
    const data = await response.json();
    
    if (data.error) {
      showNotification(data.error, 'error');
    } else {
      showNotification('Payment rejected successfully', 'success');
      await loadPayments(); // Refresh the payments list
      await loadStats();    // Refresh the statistics
    }
  } catch (err) {
    console.error('Failed to reject payment:', err);
    showNotification('Failed to reject payment', 'error');
  }
}

// Monthly stats view
async function viewStats(month) {
  try {
    // Close any existing modals first
    closeAllModals();

    // Fetch payment details for the selected month
    const details = await getJSON(`/api/admin/monthly-stats/${month}`);
    
    // Create modal container
    const statsModal = document.createElement('div');
    statsModal.className = 'modal stats-modal';
    statsModal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Payment Details for ${month}</h3>
          <span class="close-btn">&times;</span>
        </div>
        <div class="modal-body">
          <div class="scroll-container">
            <table class="payment-details">
              <thead>
                <tr>
                  <th>Roll No</th>
                  <th>Student Name</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                ${details.length ? 
                  details.map(p => `
                    <tr>
                      <td>${p.studentRoll || 'N/A'}</td>
                      <td>${p.studentName || 'Unknown Student'}</td>
                      <td>₹${p.amount?.toFixed(2) || '0.00'}</td>
                      <td>${p.method ? p.method.toUpperCase() : 'Cash'}</td>
                      <td>${p.approved ? 
                        '<span class="status-approved">✅ Approved</span>' : 
                        '<span class="status-pending">⏳ Pending</span>'}
                      </td>
                      <td>
                        ${p.screenshot ? 
                          `<a href="/uploads/${p.screenshot}" target="_blank" class="receipt-link">
                            View
                          </a>` : 
                          'None'}
                      </td>
                    </tr>
                  `).join('') : 
                  `<tr><td colspan="6" class="no-data">No payments found for this month</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Add to DOM
    document.body.appendChild(statsModal);

    // Animate in
    setTimeout(() => statsModal.classList.add('active'), 10);

    // Close functionality
    const closeBtn = statsModal.querySelector('.close-btn');
    closeBtn.addEventListener('click', () => {
      statsModal.classList.remove('active');
      setTimeout(() => statsModal.remove(), 300);
    });

    // Close on background click
    statsModal.addEventListener('click', (e) => {
      if (e.target === statsModal) {
        statsModal.classList.remove('active');
        setTimeout(() => statsModal.remove(), 300);
      }
    });

  } catch (err) {
    console.error('Failed to load monthly stats:', err);
    showNotification('Failed to load payment details. Please try again.', 'error');
  }
}



// Confirmation dialog function
function confirmAction(message, onConfirm) {
  // Create a custom confirmation modal
  const confirmModal = document.createElement('div');
  confirmModal.className = 'modal confirm-modal';
  confirmModal.style.display = 'flex';
  
  confirmModal.innerHTML = `
    <div class="modal-content confirm-content">
      <div class="modal-header">
        <h3>Confirm Action</h3>
      </div>
      <div class="modal-body">
        <p>${message}</p>
        <div class="confirm-actions">
          <button class="btn btn-secondary cancel-btn">Cancel</button>
          <button class="btn btn-primary confirm-btn">Confirm</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(confirmModal);
  
  // Add animation
  setTimeout(() => {
    confirmModal.classList.add('active');
  }, 10);
  
  // Handle button clicks
  const cancelBtn = confirmModal.querySelector('.cancel-btn');
  const confirmBtn = confirmModal.querySelector('.confirm-btn');
  
  cancelBtn.addEventListener('click', () => {
    confirmModal.classList.remove('active');
    setTimeout(() => confirmModal.remove(), 300);
  });
  
  confirmBtn.addEventListener('click', () => {
    confirmModal.classList.remove('active');
    setTimeout(() => {
      confirmModal.remove();
      onConfirm();
    }, 300);
  });
  
  // Close on outside click
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) {
      confirmModal.classList.remove('active');
      setTimeout(() => confirmModal.remove(), 300);
    }
  });
}

// Add event listener for Escape key to close modals
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAllModals();
  }
});
