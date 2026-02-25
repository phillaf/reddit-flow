// Configuration constants
const CONFIG = {
    REFRESH_INTERVAL: 60,        // seconds
    ANIMATION_DURATION: 500,     // milliseconds
    SHOCKWAVE_SIZE: 100,         // pixels
    TIMER_CIRCUMFERENCE: 62.83,  // 2π * 10 (radius)
    PREFETCH_DELAY: 100,         // ms between prefetch requests
    HIDE_ANIMATION_DURATION: 220,// ms for hide animation
    SORT_TABS: ['hot', 'new', 'rising', 'controversial', 'top'],
};

// SVG icon paths
const ICONS = {
    MOON: '<path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"></path>',
    SUN: '<circle cx="12" cy="12" r="4" fill="currentColor"></circle><path d="m12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>',
    UPVOTE: '<path d="M12 4l8 8h-6v8h-4v-8H4z" fill="currentColor"/>',
    COG: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>',
};

// DOM helper utilities
const DOM = {
    create(tag, className, attrs = {}) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        Object.entries(attrs).forEach(([key, value]) => {
            if (key === 'text') el.textContent = value;
            else if (key === 'html') el.innerHTML = value;
            else el.setAttribute(key, value);
        });
        return el;
    },
    
    createSVG(width, height, viewBox, className, innerHTML) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', width);
        svg.setAttribute('height', height);
        svg.setAttribute('viewBox', viewBox);
        if (className) svg.setAttribute('class', className);
        svg.innerHTML = innerHTML;
        return svg;
    },
    
    createLink(className, href, text, target) {
        if (target === undefined) {
            target = window.matchMedia('(max-width: 700px)').matches ? '_self' : '_blank';
        }
        const link = DOM.create('a', className, { href, text, target });
        return link;
    },
};

class RedditFeedReader {
    constructor() {
        // State
        this.currentSubreddit = '';
        this.currentSort = 'hot';
        this.posts = [];
        this.prefetchCache = {};
        this.hiddenPosts = {};
        this.favorites = [];
        this.blockedSources = [];
        
        // Timer state
        this.timerInterval = null;
        this.currentTimer = 0;
        
        // UI state
        this.isLoading = false;
        this.hasError = false;
        
        this.loadHiddenPostsFromStorage();
        this.loadBlockedSources();
        
        this.initializeElements();
        this.bindEvents();
        this.initializeTheme();
        this.initializeFavorites();
        this.initializeFromURL(); // Initialize from URL first
        
        // Only start timer if we have a subreddit
        if (this.currentSubreddit) {
            this.startRefreshTimer();
        } else {
            this.showInitialMessage();
            this.updateTimerDisplay(); // Show static timer
        }
        this.hideLoading(); // Hide loading initially
    }

    initializeElements() {
        this.app = document.getElementById('app');
        this.subredditInput = document.getElementById('subreddit-input');
        this.postsContainer = document.getElementById('posts-container');
        this.loadingElement = document.getElementById('loading');
        this.errorElement = document.getElementById('error');
        this.tabButtons = document.querySelectorAll('.tab-button');
        this.settingsToggle = document.getElementById('settings-toggle');
        this.settingsDropdown = document.getElementById('settings-dropdown');
        this.themeToggleItem = document.getElementById('theme-toggle-item');
        this.refreshTimerElement = document.getElementById('refresh-timer');
        this.timerProgress = document.querySelector('.timer-progress');
        this.favoriteButton = document.getElementById('favorite-button');
        this.favoritesToggle = document.getElementById('favorites-dropdown-toggle');
        this.favoritesDropdown = document.getElementById('favorites-dropdown');
        this.favoritesList = document.getElementById('favorites-list');
    }

    bindEvents() {
        // Subreddit input
        this.subredditInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleSubredditChange();
            }
        });

        // Tab buttons
        this.tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.handleTabChange(button.dataset.sort);
            });
        });

        // Settings toggle
        this.settingsToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleSettingsDropdown();
        });

        // Theme toggle switch inside settings
        document.getElementById('theme-switch').addEventListener('change', (e) => {
            this.setTheme(e.target.checked ? 'light' : 'dark');
        });

        // Blocked sources item inside settings
        document.getElementById('blocked-sources-item').addEventListener('click', () => {
            this.toggleSettingsDropdown(false);
            this.openBlockedSourcesModal();
        });

        // Blocked sources modal events
        document.getElementById('modal-close').addEventListener('click', () => this.closeBlockedSourcesModal());
        document.getElementById('modal-save').addEventListener('click', () => this.saveAndCloseBlockedSources());
        document.getElementById('add-blocked-source').addEventListener('click', () => this.addBlockedSource());
        document.getElementById('blocked-source-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addBlockedSource();
        });
        document.getElementById('blocked-sources-modal').addEventListener('click', (e) => {
            if (e.target.id === 'blocked-sources-modal') this.closeBlockedSourcesModal();
        });

        // Favorite button
        const favoriteButton = document.getElementById('favorite-button');
        if (favoriteButton) {
            favoriteButton.addEventListener('click', (e) => {
                this.toggleFavorite();
            });
        }
        
        // Favorites dropdown toggle
        const favoritesToggle = document.getElementById('favorites-dropdown-toggle');
        if (favoritesToggle) {
            favoritesToggle.addEventListener('click', () => {
                this.toggleFavoritesDropdown();
            });
        }
        
        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#favorites-dropdown') && 
                !e.target.closest('#favorites-dropdown-toggle')) {
                this.toggleFavoritesDropdown(false);
            }
            if (!e.target.closest('.settings-container')) {
                this.toggleSettingsDropdown(false);
            }
        });

        // Purge hidden posts link
        const purgeLink = document.getElementById('purge-hidden-posts');
        if (purgeLink) {
            purgeLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.purgeHiddenPosts();
            });
        }

        // Handle browser back/forward buttons
        window.addEventListener('popstate', (e) => {
            this.initializeFromURL();
        });
    }

    initializeFromURL() {
        const parts = window.location.pathname.split('/').filter(Boolean);
        
        let subreddit = '', sort = 'hot';
        
        if (parts.length >= 2 && parts[0] === 'r') {
            subreddit = parts[1];
            sort = parts[2] || 'hot';
        } else if (parts.length >= 4 && parts[0] === 'user' && parts[2] === 'm') {
            subreddit = `/${parts.slice(0, 4).join('/')}`;
            sort = parts[4] || 'hot';
        }
        
        this.currentSubreddit = subreddit;
        this.currentSort = sort;
        this.subredditInput.value = subreddit;
        this.updateActiveTab();
        
        if (subreddit) this.loadPosts();
    }

    updateURL() {
        if (this.currentSubreddit) {
            let newPath;
            
            if (this.isMultiReddit(this.currentSubreddit)) {
                // The multi-reddit path already includes the leading slash
                newPath = `${this.currentSubreddit}${this.currentSort !== 'hot' ? '/' + this.currentSort : ''}`;
            } else {
                // Regular subreddit
                newPath = `/r/${this.currentSubreddit}${this.currentSort !== 'hot' ? '/' + this.currentSort : ''}`;
            }
            
            window.history.pushState({}, '', newPath);
        } else {
            window.history.pushState({}, '', '/');
        }
    }

    initializeTheme() {
        // Check for saved theme first, then fallback to dark
        let savedTheme = localStorage.getItem('theme');
        
        if (!savedTheme) {
            savedTheme = 'dark';
        }
        
        this.setTheme(savedTheme);
        
        // Listen for system theme changes if no saved preference
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                // Only auto-switch if user hasn't manually set a preference
                if (!localStorage.getItem('theme')) {
                    this.setTheme(e.matches ? 'dark' : 'light');
                }
            });
        }
    }

    setTheme(theme) {
        this.app.className = `${theme}-theme`;
        document.documentElement.className = theme === 'dark' ? 'dark-theme' : '';
        
        // Sync the toggle switch
        const themeSwitch = document.getElementById('theme-switch');
        if (themeSwitch) {
            themeSwitch.checked = theme === 'light';
        }
        
        localStorage.setItem('theme', theme);
    }

    toggleTheme() {
        this.setTheme(this.app.className.includes('light') ? 'dark' : 'light');
    }

    handleSubredditChange() {
        let input = this.subredditInput.value.trim();
        
        // Normalize multi-reddit format
        if (input.includes('user/') && input.includes('/m/') && !input.startsWith('/')) {
            input = '/' + input;
        }
        
        if (input && input !== this.currentSubreddit) {
            const wasEmpty = !this.currentSubreddit;
            this.currentSubreddit = input;
            this.hasError = false;
            this.updateURL();
            this.showSubredditConfirmation();
            this.loadPosts();
            
            wasEmpty ? this.startRefreshTimer() : this.resetRefreshTimer();
        }
    }

    showSubredditConfirmation() {
        const rect = this.subredditInput.getBoundingClientRect();
        const shockwave = DOM.create('div', 'shockwave');
        Object.assign(shockwave.style, {
            position: 'fixed',
            left: `${rect.left + rect.width / 2}px`,
            top: `${rect.top + rect.height / 2}px`,
            width: '4px',
            height: '4px',
            border: '2px solid var(--success)',
            borderRadius: '50%',
            pointerEvents: 'none',
            zIndex: '1000',
            transform: 'translate(-50%, -50%)'
        });
        
        document.body.appendChild(shockwave);
        
        shockwave.animate([
            { width: '4px', height: '4px', opacity: '1', borderWidth: '2px' },
            { width: `${CONFIG.SHOCKWAVE_SIZE}px`, height: `${CONFIG.SHOCKWAVE_SIZE}px`, opacity: '0', borderWidth: '1px' }
        ], { duration: 100, easing: 'ease-out' }).onfinish = () => shockwave.remove();
        
        // Flash input border
        Object.assign(this.subredditInput.style, {
            borderColor: 'var(--success)',
            boxShadow: '0 0 0 3px rgba(40, 167, 69, 0.2)'
        });
        setTimeout(() => {
            Object.assign(this.subredditInput.style, { borderColor: '', boxShadow: '' });
        }, 100);
    }

    handleTabChange(sort) {
        if (sort !== this.currentSort) {
            this.currentSort = sort;
            this.updateActiveTab();
            this.updateURL(); // Update URL
            if (this.currentSubreddit) {
                // Check if we have cached data for this tab
                const cachedPosts = this.getCachedPosts(this.currentSubreddit, sort);
                if (cachedPosts) {
                    // Display cached data instantly
                    this.updatePosts(cachedPosts, false);
                    // Only refresh if cache is stale (older than refresh interval)
                    if (this.isCacheStale(this.currentSubreddit, sort)) {
                        this.loadPosts(false, false);
                    }
                } else {
                    // No cache, load normally with loading indicator
                    this.loadPosts(false, true);
                }
                this.resetRefreshTimer();
            }
        }
    }

    updateActiveTab() {
        this.tabButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.sort === this.currentSort);
        });
    }

    startRefreshTimer() {
        this.currentTimer = 0;
        this.updateTimerDisplay();
        
        this.timerInterval = setInterval(() => {
            if (!this.hasError) {
                this.currentTimer++;
                this.updateTimerDisplay();
                
                if (this.currentTimer >= CONFIG.REFRESH_INTERVAL) {
                    if (this.currentSubreddit) {
                        this.loadPosts(true, true);
                    }
                    this.resetRefreshTimer();
                }
            } else {
                this.updateTimerDisplay();
            }
        }, 1000);
    }

    resetRefreshTimer() {
        this.currentTimer = 0;
        this.updateTimerDisplay();
    }

    updateTimerDisplay() {
        if (this.hasError) {
            this.timerProgress.style.strokeDashoffset = CONFIG.TIMER_CIRCUMFERENCE;
            this.timerProgress.style.opacity = '0.3';
        } else {
            const progress = (this.currentTimer / CONFIG.REFRESH_INTERVAL) * CONFIG.TIMER_CIRCUMFERENCE;
            this.timerProgress.style.strokeDashoffset = CONFIG.TIMER_CIRCUMFERENCE - progress;
            this.timerProgress.style.opacity = '1';
        }
    }

    async loadPosts(isTimerRefresh = false, showLoadingIndicator = true) {
        if (!this.currentSubreddit) return;

        this.isLoading = true;
        if (showLoadingIndicator) {
            this.showLoading();
        }
        this.hideError();
        this.hideInitialMessage();

        try {
            let response;
            try {
                const url = this.getRedditApiUrl(this.currentSubreddit, this.currentSort);
                response = await fetch(url);
            } catch (_) {
                throw new Error('BLOCKED');
            }
            
            if (!response.ok) {
                throw new Error('FETCH_ERROR');
            }
            
            const data = await response.json();
            const newPosts = data.data.children
                .map(child => child.data)
                .filter(post => !post.stickied); // Filter out stickied posts
            
            if (newPosts.length === 0) {
                throw new Error('NO_POSTS');
            }
            
            // Cache the posts for this subreddit/sort
            this.setCachedPosts(this.currentSubreddit, this.currentSort, newPosts);
            
            this.updatePosts(newPosts, isTimerRefresh);
            this.hideLoading();
            this.isLoading = false;
            this.hasError = false;
            
            // Update favorite button state for successful subreddit load
            this.updateFavoriteButtonState();
            
            // Prefetch other tabs in background after successful load
            this.prefetchOtherTabs();
            
        } catch (error) {
            console.error('Failed to load posts:', error);
            this.showError(error.message);
            this.hideLoading();
            this.isLoading = false;
            this.hasError = true;
            
            // Hide favorite button on error
            if (this.favoriteButton) {
                this.favoriteButton.classList.add('hidden');
            }
        }
    }
    
    // Cache management - cache stores { posts, timestamp }
    getCachedPosts(subreddit, sort) {
        if (!this.prefetchCache[subreddit]) return null;
        const cached = this.prefetchCache[subreddit][sort];
        return cached ? cached.posts : null;
    }
    
    getCacheTimestamp(subreddit, sort) {
        if (!this.prefetchCache[subreddit]) return null;
        const cached = this.prefetchCache[subreddit][sort];
        return cached ? cached.timestamp : null;
    }
    
    isCacheStale(subreddit, sort) {
        const timestamp = this.getCacheTimestamp(subreddit, sort);
        if (!timestamp) return true;
        return (Date.now() - timestamp) > CONFIG.REFRESH_INTERVAL * 1000;
    }
    
    setCachedPosts(subreddit, sort, posts) {
        if (!this.prefetchCache[subreddit]) {
            this.prefetchCache[subreddit] = {};
        }
        this.prefetchCache[subreddit][sort] = {
            posts: posts,
            timestamp: Date.now()
        };
    }
    
    clearCacheForSubreddit(subreddit) {
        delete this.prefetchCache[subreddit];
    }
    
    // Prefetch other tabs in background
    async prefetchOtherTabs() {
        if (!this.currentSubreddit) return;
        
        const subreddit = this.currentSubreddit;
        const currentSort = this.currentSort;
        
        const tabsToPrefetch = CONFIG.SORT_TABS.filter(sort => {
            if (sort === currentSort) return false;
            if (this.getCachedPosts(subreddit, sort) && !this.isCacheStale(subreddit, sort)) return false;
            return true;
        });
        
        for (const sort of tabsToPrefetch) {
            if (this.currentSubreddit !== subreddit) break;
            
            try {
                const url = this.getRedditApiUrl(subreddit, sort);
                const response = await fetch(url);
                
                if (response.ok) {
                    const data = await response.json();
                    const posts = data.data.children
                        .map(child => child.data)
                        .filter(post => !post.stickied);
                    
                    if (this.currentSubreddit === subreddit && posts.length > 0) {
                        this.setCachedPosts(subreddit, sort, posts);
                    }
                }
            } catch (error) {
                console.debug(`Prefetch failed for ${sort}:`, error);
            }
            
            await new Promise(resolve => setTimeout(resolve, CONFIG.PREFETCH_DELAY));
        }
    }

    updatePosts(newPosts, isTimerRefresh = false) {
        const oldPosts = [...this.posts];
        this.posts = newPosts;
        
        // Sync hidden posts from other tabs to current tab
        // This ensures posts hidden on other tabs are also hidden here if they appear
        this.syncHiddenPostsFromOtherTabs(newPosts);
        
        // Get hidden posts for current subreddit and tab
        const hiddenPostsForCurrentTab = this.getHiddenPostsForCurrentSubreddit();
        
        // Clean up hidden posts that are no longer in the API response for THIS tab only
        if (this.currentSubreddit) {
            const currentPostIds = new Set(newPosts.map(post => post.id));
            const hiddenPostsArray = Array.from(hiddenPostsForCurrentTab);
            
            let removedAny = false;
            hiddenPostsArray.forEach(postId => {
                if (!currentPostIds.has(postId)) {
                    hiddenPostsForCurrentTab.delete(postId);
                    removedAny = true;
                }
            });
            
            // Save to localStorage if posts were pruned
            if (removedAny) {
                this.saveHiddenPostsToStorage();
            }
        }

        // Only animate on timer refresh, otherwise render instantly for snappy navigation
        if (isTimerRefresh && oldPosts.length > 0) {
            this.animatePostUpdates(oldPosts, newPosts);
        } else {
            this.renderPosts();
        }
    }

    animatePostUpdates(oldPosts, newPosts) {
        const container = this.postsContainer;
        const oldPostsMap = new Map(oldPosts.map(post => [post.id, post]));
        const newPostsMap = new Map(newPosts.map(post => [post.id, post]));
        
        // Filter out hidden posts and blocked sources from both old and new posts for animation comparison
        const visibleOldPosts = oldPosts.filter(post => !this.isPostHidden(post.id) && !this.isPostFromBlockedSource(post));
        const visibleNewPosts = newPosts.filter(post => !this.isPostHidden(post.id) && !this.isPostFromBlockedSource(post));
        
        // Create a temporary container for animations
        const tempContainer = document.createElement('div');
        tempContainer.className = 'posts-container';
        container.parentNode.insertBefore(tempContainer, container);
        
        // Hide the old container immediately to prevent duplicate posts showing
        container.style.display = 'none';
        
        // Process each visible new post
        visibleNewPosts.forEach((post, newIndex) => {
            const postElement = this.createPostElement(post);
            
            const wasVisibleBefore = visibleOldPosts.some(p => p.id === post.id);
            if (!wasVisibleBefore) {
                postElement.classList.add('entering');
                setTimeout(() => postElement.classList.remove('entering'), CONFIG.ANIMATION_DURATION);
            } else {
                const oldIndex = visibleOldPosts.findIndex(p => p.id === post.id);
                if (oldIndex !== newIndex) {
                    if (oldIndex > newIndex) {
                        postElement.classList.add('moving-up');
                        setTimeout(() => postElement.classList.remove('moving-up'), CONFIG.ANIMATION_DURATION);
                    } else {
                        postElement.classList.add('moving-down');
                        setTimeout(() => postElement.classList.remove('moving-down'), CONFIG.ANIMATION_DURATION);
                    }
                }
            }
            
            tempContainer.appendChild(postElement);
        });
        
        // Remove old posts that are no longer in the API (only consider visible posts)
        visibleOldPosts.forEach(post => {
            if (!newPostsMap.has(post.id)) {
                const postElement = this.findPostElement(post.id);
                if (postElement) {
                    postElement.classList.add('exiting');
                    setTimeout(() => {
                        postElement.parentNode?.removeChild(postElement);
                    }, CONFIG.ANIMATION_DURATION);
                }
            }
        });
        
        // Replace old container with new one
        setTimeout(() => {
            container.parentNode.removeChild(container);
            tempContainer.id = 'posts-container';
            this.postsContainer = tempContainer;
        }, CONFIG.ANIMATION_DURATION + 100);
    }

    findPostElement(postId) {
        return document.querySelector(`[data-post-id="${postId}"]`);
    }

    renderPosts() {
        this.postsContainer.innerHTML = '';
        
        this.posts.forEach(post => {
            // Skip hidden posts entirely - don't add them to DOM
            if (this.isPostHidden(post.id)) {
                return;
            }
            // Skip posts from blocked sources
            if (this.isPostFromBlockedSource(post)) {
                return;
            }
            const postElement = this.createPostElement(post);
            this.postsContainer.appendChild(postElement);
        });
    }

    createPostElement(post) {
        const postDiv = DOM.create('div', 'post', { 'data-post-id': post.id });
        postDiv.classList.add(this.isPostHidden(post.id) ? 'hidden' : 'visible');
        
        const permalinkUrl = `https://reddit.com${post.permalink}`;
        const subredditName = post.subreddit_name_prefixed || `r/${post.subreddit}`;
        const timeAgo = this.formatTimeAgo(post.created_utc);
        const voteCount = this.formatNumber(post.ups);
        
        // Determine post type
        const isSelftext = post.selftext?.trim();
        const isExternal = !post.is_self && post.domain && post.url_overridden_by_dest && !post.is_reddit_media_domain;
        
        // Create reusable element factories
        const createHideButton = () => {
            const btn = DOM.create('button', 'hide-btn', { text: 'Hide' });
            btn.onclick = () => this.hidePost(post.id);
            return btn;
        };
        
        const createVotesDiv = () => {
            const div = DOM.create('div', 'post-votes');
            div.appendChild(DOM.createSVG(12, 12, '0 0 24 24', 'upvote-icon', ICONS.UPVOTE));
            div.appendChild(DOM.create('span', null, { text: voteCount }));
            return div;
        };
        
        const createSubredditLink = () => 
            DOM.createLink('post-subreddit', `https://reddit.com/${subredditName}`, subredditName);
        
        const createTitleLink = (extraClass = '') => 
            DOM.createLink(`post-title ${extraClass}`.trim(), permalinkUrl, post.title);
        
        const createMetadata = (extraClass = '') => {
            const div = DOM.create('div', `post-metadata ${extraClass}`.trim());
            div.appendChild(DOM.create('span', 'post-time', { text: timeAgo }));
            
            if (isSelftext) {
                div.appendChild(DOM.create('span', 'post-meta-separator', { text: '•' }));
                div.appendChild(DOM.createLink('post-description-link selftext-link', permalinkUrl, post.selftext));
            } else if (isExternal) {
                div.appendChild(DOM.create('span', 'post-meta-separator', { text: '•' }));
                div.appendChild(DOM.createLink('post-description-link external-link', post.url_overridden_by_dest, post.domain));
            }
            return div;
        };
        
        // Desktop layout: voting section + content
        const votingSection = DOM.create('div', 'post-voting-section');
        votingSection.appendChild(createHideButton());
        votingSection.appendChild(createVotesDiv());
        
        const contentDiv = DOM.create('div', 'post-content');
        if (isSelftext) contentDiv.classList.add('selftext-post');
        else if (isExternal) contentDiv.classList.add('external-post');
        
        contentDiv.appendChild(createSubredditLink());
        contentDiv.appendChild(createTitleLink());
        contentDiv.appendChild(createMetadata());
        
        // Mobile layout: header row + title + metadata
        const headerRow = DOM.create('div', 'post-header-row');
        headerRow.appendChild(createHideButton());
        headerRow.appendChild(createVotesDiv());
        headerRow.appendChild(createSubredditLink());
        
        const mobileWrapper = DOM.create('div', 'mobile-content-wrapper');
        mobileWrapper.appendChild(headerRow);
        mobileWrapper.appendChild(createTitleLink('mobile-title'));
        mobileWrapper.appendChild(createMetadata('mobile-metadata'));
        
        postDiv.appendChild(votingSection);
        postDiv.appendChild(contentDiv);
        postDiv.appendChild(mobileWrapper);
        
        return postDiv;
    }

    hidePost(postId) {
        if (this.currentSubreddit) {
            this.ensureHiddenPostsStructure(this.currentSubreddit, this.currentSort).add(postId);
            this.saveHiddenPostsToStorage();
        }
        
        document.querySelectorAll(`[data-post-id="${postId}"]`).forEach(el => {
            el.classList.remove('visible');
            el.classList.add('hiding');
            setTimeout(() => el.parentNode?.removeChild(el), CONFIG.HIDE_ANIMATION_DURATION);
        });
    }

    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'k';
        }
        return num.toString();
    }

    formatTimeAgo(timestamp) {
        const now = Date.now() / 1000;
        const diffSeconds = Math.floor(now - timestamp);
        
        if (diffSeconds < 60) {
            return 'just now';
        } else if (diffSeconds < 3600) {
            const minutes = Math.floor(diffSeconds / 60);
            return `${minutes}m ago`;
        } else if (diffSeconds < 86400) {
            const hours = Math.floor(diffSeconds / 3600);
            return `${hours}h ago`;
        } else {
            const days = Math.floor(diffSeconds / 86400);
            return `${days}d ago`;
        }
    }

    showLoading() {
        if (this.isLoading) {
            this.loadingElement.classList.remove('hidden');
        }
    }

    hideLoading() {
        this.loadingElement.classList.add('hidden');
    }
    
    getErrorContent(errorType) {
        const isMulti = this.isMultiReddit(this.currentSubreddit);
        const sub = this.currentSubreddit;
        const sort = this.currentSort;
        const verifyUrl = isMulti 
            ? `https://www.reddit.com${sub}` 
            : `https://www.reddit.com/r/${sub}`;
        const verifyText = isMulti ? `reddit.com${sub}` : `reddit.com/r/${sub}`;
        
        if (errorType === 'NO_POSTS') {
            const type = isMulti ? 'multi-reddit' : 'subreddit';
            return {
                title: 'No Posts Found',
                message: `The ${type} "${sub}" exists but has no posts in the "${sort}" category.`,
                suggestions: ['Try switching to a different tab (Hot, New, etc.) or check back later.']
            };
        }

        if (errorType === 'BLOCKED') {
            return {
                title: 'Request Blocked by Browser',
                message: 'Your browser\'s privacy shield is blocking requests to Reddit\'s API.',
                suggestions: [
                    '<strong>Brave Browser:</strong> Tap the shield icon (🛡) in the address bar and select <strong>"Shields DOWN for this site"</strong>, then try again.',
                    '<strong>Other browsers:</strong> If you\'re using a privacy extension (uBlock Origin, Privacy Badger, etc.), try disabling it for this site.',
                    'This site fetches posts directly from Reddit\'s public API and does not track you in any way.'
                ]
            };
        }
        
        const type = isMulti ? 'multi-reddit' : 'subreddit';
        return {
            title: 'Unable to Load Posts',
            message: `Could not load posts from ${type} "${sub}".`,
            suggestions: [
                `Please double-check the ${type} ${isMulti ? 'path' : 'name'} and try again.`,
                `You can verify it exists by visiting: <a href="${verifyUrl}" target="_blank" rel="noopener">${verifyText}</a>`,
                'This could also be due to network issues or Reddit being temporarily unavailable. Check the <a href="https://www.redditstatus.com" target="_blank" rel="noopener">Reddit Status Page</a> if the problem persists.'
            ]
        };
    }

    showError(errorType = 'GENERIC') {
        this.hideInitialMessage();
        
        const { title, message, suggestions } = this.getErrorContent(errorType);
        const suggestionHtml = suggestions
            .map(s => `<p class="error-suggestion">${s}</p>`)
            .join('');
        
        const errorMessage = DOM.create('div', 'error-message', { id: 'error-message' });
        errorMessage.innerHTML = `
            <div class="error-message-content">
                <h2>${title}</h2>
                <p>${message}</p>
                ${suggestionHtml}
                <button class="retry-button" onclick="window.redditFeedReader.retryLoading()">Try Again</button>
            </div>
        `;
        
        this.postsContainer.innerHTML = '';
        this.postsContainer.appendChild(errorMessage);
    }

    retryLoading() {
        this.hasError = false;
        this.resetRefreshTimer(); // Reset timer when retrying
        if (this.currentSubreddit) {
            this.loadPosts();
        } else {
            this.showInitialMessage();
        }
    }

    hideError() {
        this.errorElement.classList.add('hidden');
        const errorMessage = document.getElementById('error-message');
        if (errorMessage) {
            errorMessage.remove();
        }
    }

    showInitialMessage() {
        if (!this.currentSubreddit) {
            const initialMessage = document.createElement('div');
            initialMessage.id = 'initial-message';
            initialMessage.className = 'initial-message';
            initialMessage.innerHTML = `
                <div class="initial-message-content">
                    <h2>Welcome to Reddit Flow</h2>
                    <p>Enter a subreddit or multi-reddit to display posts</p>
                    <p class="example">Subreddit: worldnews, technology, programming</p>
                    <p class="example">Multi-reddit: /user/username/m/multiname</p>
                </div>
            `;
            this.postsContainer.appendChild(initialMessage);
        }
    }

    hideInitialMessage() {
        const initialMessage = document.getElementById('initial-message');
        if (initialMessage) {
            initialMessage.remove();
        }
    }

    // Check if a string is a multi-reddit format
    isMultiReddit(input) {
        if (!input) return false;
        
        // Handle formats with or without leading slash
        const normalizedInput = input.startsWith('/') ? input : '/' + input;
        
        // Parse parts for proper structure: /user/username/m/multiname
        const parts = normalizedInput.split('/').filter(part => part);
        return parts.length >= 4 && 
               parts[0] === 'user' && 
               parts[2] === 'm';
    }
    
    // Format the URL for API calls based on input type (subreddit or multi-reddit)
    getRedditApiUrl(input, sort) {
        if (this.isMultiReddit(input)) {
            return `https://www.reddit.com${input}/${sort}.json?limit=50`;
        } else {
            return `https://www.reddit.com/r/${input}/${sort}.json?limit=50`;
        }
    }
    
    // Get the storage key for hidden posts (subreddit or multi-reddit path)
    getStorageKey(input) {
        return input;
    }
    
    // Ensure hidden posts structure exists for subreddit/sort
    ensureHiddenPostsStructure(subreddit, sort) {
        const key = this.getStorageKey(subreddit);
        this.hiddenPosts[key] ??= {};
        this.hiddenPosts[key][sort] ??= new Set();
        return this.hiddenPosts[key][sort];
    }

    loadHiddenPostsFromStorage() {
        try {
            const stored = localStorage.getItem('hiddenPosts');
            if (!stored) return;
            
            const data = JSON.parse(stored);
            for (const subreddit in data) {
                const subredditData = data[subreddit];
                // Handle migration from old array format
                if (Array.isArray(subredditData)) {
                    this.hiddenPosts[subreddit] = { hot: new Set(subredditData) };
                } else {
                    this.hiddenPosts[subreddit] = {};
                    for (const sort in subredditData) {
                        this.hiddenPosts[subreddit][sort] = new Set(subredditData[sort]);
                    }
                }
            }
        } catch (error) {
            console.error('Error loading hidden posts:', error);
            this.hiddenPosts = {};
        }
    }
    
    saveHiddenPostsToStorage() {
        try {
            const data = {};
            for (const subreddit in this.hiddenPosts) {
                data[subreddit] = {};
                for (const sort in this.hiddenPosts[subreddit]) {
                    data[subreddit][sort] = [...this.hiddenPosts[subreddit][sort]];
                }
            }
            localStorage.setItem('hiddenPosts', JSON.stringify(data));
        } catch (error) {
            console.error('Error saving hidden posts:', error);
        }
    }
    
    getHiddenPostsForCurrentSubreddit() {
        if (!this.currentSubreddit) return new Set();
        return this.ensureHiddenPostsStructure(this.currentSubreddit, this.currentSort);
    }
    
    isPostHidden(postId) {
        if (!this.currentSubreddit) return false;
        const key = this.getStorageKey(this.currentSubreddit);
        return this.hiddenPosts[key]?.[this.currentSort]?.has(postId) ?? false;
    }
    
    getAllHiddenPostIdsForSubreddit(subreddit = this.currentSubreddit) {
        if (!subreddit) return new Set();
        const key = this.getStorageKey(subreddit);
        const allIds = new Set();
        if (this.hiddenPosts[key]) {
            for (const sortSet of Object.values(this.hiddenPosts[key])) {
                for (const id of sortSet) allIds.add(id);
            }
        }
        return allIds;
    }
    
    syncHiddenPostsFromOtherTabs(newPosts) {
        if (!this.currentSubreddit) return;
        
        const key = this.getStorageKey(this.currentSubreddit);
        const currentPostIds = new Set(newPosts.map(p => p.id));
        const currentTabHidden = this.getHiddenPostsForCurrentSubreddit();
        
        // Collect hidden IDs from other tabs
        const hiddenFromOtherTabs = new Set();
        if (this.hiddenPosts[key]) {
            for (const [sort, ids] of Object.entries(this.hiddenPosts[key])) {
                if (sort !== this.currentSort) {
                    for (const id of ids) hiddenFromOtherTabs.add(id);
                }
            }
        }
        
        // Sync posts that appear in current response
        let changed = false;
        for (const id of hiddenFromOtherTabs) {
            if (currentPostIds.has(id) && !currentTabHidden.has(id)) {
                currentTabHidden.add(id);
                changed = true;
            }
        }
        
        if (changed) this.saveHiddenPostsToStorage();
    }
    
    getHiddenPostsCount(subreddit = this.currentSubreddit) {
        if (!subreddit) return 0;
        const key = this.getStorageKey(subreddit);
        return this.hiddenPosts[key]?.[this.currentSort]?.size ?? 0;
    }
    
    getTotalHiddenPostsCount() {
        let total = 0;
        for (const subreddit of Object.values(this.hiddenPosts)) {
            for (const sortSet of Object.values(subreddit)) {
                total += sortSet.size;
            }
        }
        return total;
    }
    
    // Purge all hidden posts from memory and localStorage
    purgeHiddenPosts() {
        this.hiddenPosts = {};
        this.saveHiddenPostsToStorage();
        this.showNotification('All hidden posts have been restored');
        if (this.currentSubreddit) this.loadPosts();
    }
    
    showNotification(message) {
        const notification = DOM.create('div', 'notification success-notification', { text: message });
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('fading-out');
            setTimeout(() => notification.remove(), 500);
        }, 3000);
    }

    initializeFavorites() {
        this.favorites = [];
        this.loadFavoritesFromStorage();
        this.renderFavoritesList();
        
        // Initialize favorite button state
        this.updateFavoriteButtonState();
    }
    
    // Load favorites from localStorage
    loadFavoritesFromStorage() {
        try {
            const storedFavorites = localStorage.getItem('redditFlowFavorites');
            if (storedFavorites) {
                this.favorites = JSON.parse(storedFavorites);
            }
        } catch (error) {
            console.error('Error loading favorites from storage:', error);
            this.favorites = [];
        }
    }
    
    // Save favorites to localStorage
    saveFavoritesToStorage() {
        try {
            localStorage.setItem('redditFlowFavorites', JSON.stringify(this.favorites));
        } catch (error) {
            console.error('Error saving favorites to storage:', error);
        }
    }
    
    // Check if current subreddit is favorited
    isCurrentSubredditFavorited() {
        if (!this.currentSubreddit) return false;
        return this.favorites.some(fav => fav.path === this.currentSubreddit);
    }
    
    // Toggle favorite status for current subreddit
    toggleFavorite() {
        if (!this.currentSubreddit) return;
        
        if (this.isCurrentSubredditFavorited()) {
            // Remove from favorites
            this.favorites = this.favorites.filter(fav => fav.path !== this.currentSubreddit);
        } else {
            // Add to favorites
            const label = this.isMultiReddit(this.currentSubreddit) ? 
                this.getMultiRedditDisplayName(this.currentSubreddit) : 
                this.currentSubreddit;
                
            this.favorites.push({
                path: this.currentSubreddit,
                label: label,
                type: this.isMultiReddit(this.currentSubreddit) ? 'multi' : 'subreddit',
                timestamp: Date.now()
            });
        }
        
        // Save favorites and update UI
        this.saveFavoritesToStorage();
        this.renderFavoritesList();
        this.updateFavoriteButtonState();
        
        // Animate the favorite button
        const favoriteButton = document.getElementById('favorite-button');
        favoriteButton.classList.add('favorite-animation');
        
        // Remove the animation class after it completes to allow it to be triggered again
        setTimeout(() => {
            favoriteButton.classList.remove('favorite-animation');
        }, 400); // Match the animation duration in CSS
    }
    
    // Get a display name for a multi-reddit
    getMultiRedditDisplayName(path) {
        // Extract the username and multi name from the path
        const parts = path.split('/').filter(part => part);
        if (parts.length >= 4 && parts[0] === 'user' && parts[2] === 'm') {
            return `${parts[1]}'s ${parts[3]}`;
        }
        return path;
    }
    
    // Remove a favorite by path
    removeFavorite(path) {
        this.favorites = this.favorites.filter(fav => fav.path !== path);
        this.saveFavoritesToStorage();
        this.renderFavoritesList();
        
        // If the current subreddit was removed from favorites, update button state
        if (path === this.currentSubreddit) {
            this.updateFavoriteButtonState();
        }
    }
    
    // Render favorites list in dropdown
    renderFavoritesList() {
        const favoritesList = document.getElementById('favorites-list');
        const favoritesEmpty = document.querySelector('.favorites-empty');
        
        if (!favoritesList) return;
        
        favoritesList.innerHTML = '';
        
        if (this.favorites.length === 0) {
            favoritesEmpty.classList.remove('hidden');
            return;
        }
        
        favoritesEmpty.classList.add('hidden');
        
        // Sort favorites by most recently added
        const sortedFavorites = [...this.favorites].sort((a, b) => b.timestamp - a.timestamp);
        
        sortedFavorites.forEach(fav => {
            const item = document.createElement('div');
            item.className = 'favorite-item';
            
            const itemText = document.createElement('div');
            itemText.className = 'favorite-item-text';
            itemText.textContent = fav.label;
            itemText.title = fav.path;
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'favorite-item-remove';
            removeBtn.innerHTML = '×';
            removeBtn.title = 'Remove from favorites';
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                this.removeFavorite(fav.path);
            };
            
            item.appendChild(itemText);
            item.appendChild(removeBtn);
            
            item.onclick = () => {
                this.subredditInput.value = fav.path;
                this.handleSubredditChange();
                this.toggleFavoritesDropdown(false); // Close dropdown
            };
            
            favoritesList.appendChild(item);
        });
    }
    
    // Update favorite button state based on current subreddit
    updateFavoriteButtonState() {
        const favoriteButton = document.getElementById('favorite-button');
        if (!favoriteButton) return;
        
        if (!this.currentSubreddit) {
            favoriteButton.classList.add('hidden');
            return;
        }
        
        favoriteButton.classList.remove('hidden');
        
        // Get the SVG path element
        const favoriteIconPath = favoriteButton.querySelector('.favorite-path');
        
        if (this.isCurrentSubredditFavorited()) {
            // Set active state with filled icon
            favoriteButton.classList.add('active');
            favoriteButton.title = 'Remove from favorites';
            
            if (favoriteIconPath) {
                favoriteIconPath.setAttribute('fill', 'currentColor');
            }
        } else {
            // Set inactive state with outline icon
            favoriteButton.classList.remove('active');
            favoriteButton.title = 'Add to favorites';
            
            if (favoriteIconPath) {
                favoriteIconPath.setAttribute('fill', 'none');
            }
        }
    }
    
    // Toggle favorites dropdown visibility
    toggleFavoritesDropdown(forceState = null) {
        const dropdown = document.getElementById('favorites-dropdown');
        if (!dropdown) return;
        
        if (forceState !== null) {
            dropdown.classList.toggle('hidden', !forceState);
        } else {
            dropdown.classList.toggle('hidden');
        }
    }
    
    // Empty method to replace showFavoriteConfirmation
    // We're now using animation instead of notification

    // Settings dropdown
    toggleSettingsDropdown(forceState = null) {
        const dropdown = document.getElementById('settings-dropdown');
        if (!dropdown) return;
        if (forceState !== null) {
            dropdown.classList.toggle('hidden', !forceState);
        } else {
            dropdown.classList.toggle('hidden');
        }
    }

    // === Blocked Sources ===
    loadBlockedSources() {
        try {
            const stored = localStorage.getItem('blockedSources');
            this.blockedSources = stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error('Error loading blocked sources:', e);
            this.blockedSources = [];
        }
    }

    saveBlockedSources() {
        try {
            localStorage.setItem('blockedSources', JSON.stringify(this.blockedSources));
        } catch (e) {
            console.error('Error saving blocked sources:', e);
        }
    }

    openBlockedSourcesModal() {
        document.getElementById('blocked-sources-modal').classList.remove('hidden');
        this.renderBlockedSourcesList();
        document.getElementById('blocked-source-input').value = '';
        document.getElementById('blocked-source-input').focus();
    }

    closeBlockedSourcesModal() {
        document.getElementById('blocked-sources-modal').classList.add('hidden');
    }

    saveAndCloseBlockedSources() {
        this.saveBlockedSources();
        this.closeBlockedSourcesModal();
        // Re-render posts to apply the filter
        if (this.currentSubreddit && this.posts.length > 0) {
            this.renderPosts();
        }
        this.showNotification('Blocked sources updated');
    }

    addBlockedSource() {
        const input = document.getElementById('blocked-source-input');
        let domain = input.value.trim().toLowerCase();
        if (!domain) return;

        // Clean up the domain (remove protocol, www, trailing slashes)
        domain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

        if (this.blockedSources.includes(domain)) {
            input.value = '';
            return; // Already blocked
        }

        this.blockedSources.push(domain);
        input.value = '';
        this.renderBlockedSourcesList();
    }

    removeBlockedSource(domain) {
        this.blockedSources = this.blockedSources.filter(d => d !== domain);
        this.renderBlockedSourcesList();
    }

    renderBlockedSourcesList() {
        const list = document.getElementById('blocked-sources-list');
        const empty = document.getElementById('blocked-sources-empty');
        list.innerHTML = '';

        if (this.blockedSources.length === 0) {
            empty.classList.remove('hidden');
            return;
        }

        empty.classList.add('hidden');

        this.blockedSources.forEach(domain => {
            const item = DOM.create('div', 'blocked-source-item');

            const label = DOM.create('span', 'blocked-source-domain', { text: domain });
            const removeBtn = DOM.create('button', 'blocked-source-remove', { html: '&times;', title: 'Remove' });
            removeBtn.addEventListener('click', () => this.removeBlockedSource(domain));

            item.appendChild(label);
            item.appendChild(removeBtn);
            list.appendChild(item);
        });
    }

    isPostFromBlockedSource(post) {
        if (this.blockedSources.length === 0) return false;
        const domain = (post.domain || '').toLowerCase().replace(/^www\./, '');
        return this.blockedSources.some(blocked => domain === blocked || domain.endsWith('.' + blocked));
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.redditFeedReader = new RedditFeedReader();
});
