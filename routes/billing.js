const API = "https://gumtree-backend-9aaz.onrender.com";

const loginBox = document.getElementById("loginBox");
const lockedBox = document.getElementById("lockedBox");
const mainBox = document.getElementById("mainBox");
const statusText = document.getElementById("status");

const imageInput = document.getElementById("images");
const imagePreview = document.getElementById("imagePreview");

let currentImages = [];
let licenceActive = false;

async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(API + path, options);

    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok) {
      return {
        success: false,
        message: data.message || "Server error.",
        status: res.status,
      };
    }

    return data;
  } catch (error) {
    console.error("Backend connection failed:", error);
    return {
      success: false,
      message: "Cannot connect to backend.",
    };
  }
}

async function checkLicence(token) {
  return await apiFetch("/api/licence/check", {
    method: "GET",
    headers: {
      Authorization: "Bearer " + token,
    },
  });
}

function showLogin() {
  loginBox.style.display = "block";
  lockedBox.style.display = "none";
  mainBox.style.display = "none";
}

function showMain() {
  loginBox.style.display = "none";
  lockedBox.style.display = "none";
  mainBox.style.display = "block";
}

function showMainWithLockedNotice() {
  loginBox.style.display = "none";
  lockedBox.style.display = "block";
  mainBox.style.display = "block";
}

function clearForm() {
  document.getElementById("listingTitle").value = "";
  document.getElementById("listingPrice").value = "";
  document.getElementById("listingDescription").value = "";
  imageInput.value = "";
  imagePreview.innerHTML = "";
  currentImages = [];
}

function renderImagePreview(images) {
  imagePreview.innerHTML = "";

  images.forEach((src) => {
    const img = document.createElement("img");
    img.src = src;
    imagePreview.appendChild(img);
  });
}

function copyToClipboard(text, message) {
  navigator.clipboard.writeText(text || "").then(() => {
    statusText.innerText = message;
  });
}

chrome.storage.local.get(["token"], async (data) => {
  if (!data.token) {
    showLogin();
    return;
  }

  statusText.innerText = "Checking licence...";

  const licence = await checkLicence(data.token);
  licenceActive = !!(licence && licence.active);

  if (licenceActive) {
    showMain();
    statusText.innerText = "";
  } else {
    showMainWithLockedNotice();
    statusText.innerText = "Fill All is locked. Subscribe to unlock auto-fill.";
  }

  renderListings();
});

document.getElementById("registerBtn").onclick = async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    statusText.innerText = "Enter email and password.";
    return;
  }

  statusText.innerText = "Registering...";

  const data = await apiFetch("/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (data.token) {
    chrome.storage.local.set({ token: data.token }, async () => {
      const licence = await checkLicence(data.token);
      licenceActive = !!(licence && licence.active);

      if (licenceActive) {
        showMain();
        statusText.innerText = "Registered and logged in.";
      } else {
        showMainWithLockedNotice();
        statusText.innerText = "Registered. Subscribe to unlock Fill All.";
      }

      renderListings();
    });
  } else {
    statusText.innerText = data.message || "Register failed.";
  }
};

document.getElementById("loginBtn").onclick = async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    statusText.innerText = "Enter email and password.";
    return;
  }

  statusText.innerText = "Logging in...";

  const data = await apiFetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (data.token) {
    chrome.storage.local.set({ token: data.token }, async () => {
      const licence = await checkLicence(data.token);
      licenceActive = !!(licence && licence.active);

      if (licenceActive) {
        showMain();
        statusText.innerText = "Logged in.";
      } else {
        showMainWithLockedNotice();
        statusText.innerText = "Logged in. Subscribe to unlock Fill All.";
      }

      renderListings();
    });
  } else {
    statusText.innerText = data.message || "Login failed.";
  }
};

document.getElementById("logoutBtn").onclick = () => {
  chrome.storage.local.remove("token", () => {
    licenceActive = false;
    showLogin();
    statusText.innerText = "Logged out.";
  });
};

document.getElementById("subscribeBtn").onclick = async () => {
  statusText.innerText = "Opening payment page...";

  chrome.storage.local.get(["token"], async (storage) => {
    if (!storage.token) {
      statusText.innerText = "Please login first.";
      showLogin();
      return;
    }

    const data = await apiFetch("/api/billing/create-checkout-session", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + storage.token,
      },
    });

    if (data.url) {
      chrome.tabs.create({ url: data.url });
    } else {
      statusText.innerText = data.message || "Payment error.";
    }
  });
};

imageInput.addEventListener("change", () => {
  currentImages = [];
  imagePreview.innerHTML = "";

  const files = Array.from(imageInput.files);
  if (files.length === 0) return;

  const imagePromises = files.map((file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve(event.target.result);
      reader.readAsDataURL(file);
    });
  });

  Promise.all(imagePromises).then((images) => {
    currentImages = images;
    renderImagePreview(currentImages);
  });
});

document.getElementById("saveListingBtn").onclick = () => {
  const title = document.getElementById("listingTitle").value.trim();
  const price = document.getElementById("listingPrice").value.trim();
  const description = document.getElementById("listingDescription").value.trim();

  if (!title || !price || !description) {
    statusText.innerText = "Please add title, price and description.";
    return;
  }

  const listing = {
    title,
    price,
    description,
    images: currentImages,
    savedAt: new Date().toISOString(),
  };

  chrome.storage.local.get({ listings: [] }, (data) => {
    const listings = data.listings || [];
    listings.unshift(listing);

    chrome.storage.local.set({ listings }, () => {
      statusText.innerText = "Listing saved.";
      clearForm();
      renderListings();
    });
  });
};

document.getElementById("selectAllBtn").onclick = () => {
  const checkboxes = document.querySelectorAll(".selectListing");
  const allSelected = Array.from(checkboxes).every((box) => box.checked);

  checkboxes.forEach((box) => {
    box.checked = !allSelected;
  });

  statusText.innerText = allSelected ? "All ads unselected." : "All ads selected.";
};

document.getElementById("deleteSelectedBtn").onclick = () => {
  chrome.storage.local.get({ listings: [] }, (data) => {
    const selectedIndexes = Array.from(
      document.querySelectorAll(".selectListing:checked")
    ).map((box) => Number(box.getAttribute("data-index")));

    if (selectedIndexes.length === 0) {
      statusText.innerText = "No ads selected.";
      return;
    }

    const updatedListings = data.listings.filter((_, index) => {
      return !selectedIndexes.includes(index);
    });

    chrome.storage.local.set({ listings: updatedListings }, () => {
      statusText.innerText = selectedIndexes.length + " selected ad(s) deleted.";
      renderListings();
    });
  });
};

document.getElementById("exportAdsBtn").onclick = () => {
  chrome.storage.local.get({ listings: [] }, (data) => {
    const exportData = {
      app: "CrossPoster",
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      listings: data.listings || [],
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "crossposter-ads-backup.json";
    a.click();

    URL.revokeObjectURL(url);
    statusText.innerText = "Ads exported.";
  });
};

document.getElementById("importAdsBtn").onclick = () => {
  document.getElementById("importFileInput").click();
};

document.getElementById("importFileInput").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);

      let importedListings = [];

      if (Array.isArray(imported)) {
        importedListings = imported;
      } else if (Array.isArray(imported.listings)) {
        importedListings = imported.listings;
      } else {
        statusText.innerText = "Invalid import file.";
        return;
      }

      importedListings = importedListings.filter((item) => {
        return item && item.title && item.price && item.description;
      });

      chrome.storage.local.get({ listings: [] }, (data) => {
        const combined = [...importedListings, ...data.listings];

        chrome.storage.local.set({ listings: combined }, () => {
          statusText.innerText = importedListings.length + " ad(s) imported.";
          renderListings();
        });
      });
    } catch (error) {
      statusText.innerText = "Import failed. Invalid JSON file.";
    }

    event.target.value = "";
  };

  reader.readAsText(file);
});

function scrollToNextListing(lastUsedIndex) {
  if (lastUsedIndex === null || lastUsedIndex === undefined) return;

  let nextIndex = Number(lastUsedIndex) - 1;
  if (nextIndex < 0) nextIndex = 0;

  const target = document.getElementById("listing-" + nextIndex);

  if (target) {
    setTimeout(() => {
      target.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 150);
  }
}

function renderListings() {
  const container = document.getElementById("savedListings");

  chrome.storage.local.get({ listings: [], lastUsedIndex: null }, (data) => {
    container.innerHTML = "";

    if (!data.listings || data.listings.length === 0) {
      container.innerHTML = "<p>No saved listings yet.</p>";
      return;
    }

    data.listings.forEach((item, index) => {
      const div = document.createElement("div");
      div.className = "saved-item";
      div.id = "listing-" + index;

      const images = item.images || [];
      const firstImage = images.length > 0 ? images[0] : "";

      div.innerHTML = `
        <div class="saved-checkbox">
          <input type="checkbox" class="selectListing" data-index="${index}">
        </div>

        <div class="saved-image">
          ${
            firstImage
              ? `<img src="${firstImage}" alt="Listing image">`
              : `<div class="no-image">No image</div>`
          }
        </div>

        <div class="saved-info">
          <div class="saved-title">${item.title || ""}</div>
          <div class="saved-price">Price: ${item.price || ""}</div>
          <div class="saved-description">${item.description || ""}</div>
        </div>

        <div class="saved-actions">
          <button data-index="${index}" class="fillAllBtn main-fill-btn">Fill All</button>
          <button data-index="${index}" class="copyTitleBtn">Copy Title</button>
          <button data-index="${index}" class="copyDescBtn">Copy Description</button>
          <button data-index="${index}" class="copyPriceBtn">Copy Price</button>
          <button data-index="${index}" class="deleteBtn delete-btn">Delete</button>
        </div>
      `;

      container.appendChild(div);
    });

    scrollToNextListing(data.lastUsedIndex);

    document.querySelectorAll(".fillAllBtn").forEach((btn) => {
      btn.onclick = () => {
        const i = Number(btn.getAttribute("data-index"));
        const item = data.listings[i];

        if (!licenceActive) {
          chrome.storage.local.set({ lastUsedIndex: i }, () => {
            statusText.innerText = "Fill All is locked. Subscribe to unlock auto-fill.";
            scrollToNextListing(i);
          });
          return;
        }

        chrome.storage.local.set(
          {
            currentPostAd: item,
            lastUsedIndex: i,
          },
          () => {
            statusText.innerText = "Filling Gumtree form...";

            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (!tabs[0] || !tabs[0].id) {
                statusText.innerText = "Open Gumtree form first.";
                return;
              }

              chrome.tabs.sendMessage(
                tabs[0].id,
                { action: "fillCurrentPage" },
                () => {
                  if (chrome.runtime.lastError) {
                    statusText.innerText =
                      "Open Gumtree form first, then click Fill All.";
                  } else {
                    statusText.innerText = "Form filled.";
                    scrollToNextListing(i);
                  }
                }
              );
            });
          }
        );
      };
    });

    document.querySelectorAll(".copyTitleBtn").forEach((btn) => {
      btn.onclick = () => {
        const i = Number(btn.getAttribute("data-index"));
        copyToClipboard(data.listings[i].title, "Title copied.");
      };
    });

    document.querySelectorAll(".copyDescBtn").forEach((btn) => {
      btn.onclick = () => {
        const i = Number(btn.getAttribute("data-index"));
        copyToClipboard(data.listings[i].description, "Description copied.");
      };
    });

    document.querySelectorAll(".copyPriceBtn").forEach((btn) => {
      btn.onclick = () => {
        const i = Number(btn.getAttribute("data-index"));
        copyToClipboard(data.listings[i].price, "Price copied.");
      };
    });

    document.querySelectorAll(".deleteBtn").forEach((btn) => {
      btn.onclick = () => {
        const i = Number(btn.getAttribute("data-index"));

        chrome.storage.local.get({ listings: [] }, (freshData) => {
          freshData.listings.splice(i, 1);

          chrome.storage.local.set({ listings: freshData.listings }, () => {
            statusText.innerText = "Listing deleted.";
            renderListings();
          });
        });
      };
    });
  });
}
