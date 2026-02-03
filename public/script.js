class RedditFeedReader {
    constructor() {
        // Constants
        this.REFRESH_INTERVAL = 60; // seconds
        this.ANIMATION_DURATION = 500; // milliseconds
        this.SHOCKWAVE_SIZE = 100; // pixels
        this.TIMER_CIRCUMFERENCE = 62.83; // 2π * 10 (radius)
        
        // Theme icon constants
        this.THEME_ICONS = {
            MOON: '<path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"></path>',
            SUN: '<circle cx="12" cy="12" r="4" fill="currentColor"></circle><path d="m12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>'
        };
        
        this.currentSubreddit = '';
        this.currentSort = 'hot';
        this.posts = [];
        
        // Initialize hiddenPosts as an object with subreddit keys and Set values
        this.hiddenPosts = {};
        this.loadHiddenPostsFromStorage();
        
        // Initialize favorites
        this.favorites = [];
        
        this.refreshInterval = null;
        this.timerInterval = null;
        this.refreshTimer = this.REFRESH_INTERVAL;
        this.currentTimer = 0;
        this.isLoading = false;
        this.hasError = false;
        
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
        this.themeToggle = document.getElementById('theme-toggle');
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

        // Theme toggle
        this.themeToggle.addEventListener('click', () => {
            this.toggleTheme();
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
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#favorites-dropdown') && 
                !e.target.closest('#favorites-dropdown-toggle')) {
                this.toggleFavoritesDropdown(false);
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
        const path = window.location.pathname;
        const pathParts = path.split('/').filter(part => part);
        
        if (pathParts.length >= 2 && pathParts[0] === 'r') {
            // URL format: /r/subreddit or /r/subreddit/sort
            const subreddit = pathParts[1];
            const sort = pathParts[2] || 'hot';
            
            this.currentSubreddit = subreddit;
            this.currentSort = sort;
            this.subredditInput.value = subreddit;
            this.updateActiveTab();
            
            // Load posts if we have a subreddit
            if (this.currentSubreddit) {
                this.loadPosts();
            }
        } else if (pathParts.length >= 4 && pathParts[0] === 'user' && pathParts[2] === 'm') {
            // URL format: /user/username/m/multiname or /user/username/m/multiname/sort
            // Construct the multi-reddit path
            const multiRedditPath = `/${pathParts.slice(0, 4).join('/')}`;
            const sort = pathParts[4] || 'hot';
            
            this.currentSubreddit = multiRedditPath;
            this.currentSort = sort;
            this.subredditInput.value = multiRedditPath;
            this.updateActiveTab();
            
            // Load posts if we have a multi-reddit
            if (this.currentSubreddit) {
                this.loadPosts();
            }
        } else {
            // No valid subreddit or multi-reddit in URL, reset to defaults
            this.currentSubreddit = '';
            this.currentSort = 'hot';
            this.subredditInput.value = '';
            this.updateActiveTab();
        }
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
        // Check for saved theme first, then system preference, then fallback to light
        let savedTheme = localStorage.getItem('theme');
        
        if (!savedTheme) {
            // Use system preference if no saved theme
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                savedTheme = 'dark';
            } else {
                savedTheme = 'light';
            }
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
        // Apply theme to both app element and html element for consistent background
        this.app.className = `${theme}-theme`;
        document.documentElement.className = theme === 'dark' ? 'dark-theme' : '';
        
        const themeIcon = this.themeToggle.querySelector('.theme-icon');
        
        if (theme === 'light') {
            // Moon icon for switching to dark mode
            themeIcon.innerHTML = this.THEME_ICONS.MOON;
        } else {
            // Sun icon for switching to light mode
            themeIcon.innerHTML = this.THEME_ICONS.SUN;
        }
        
        localStorage.setItem('theme', theme);
    }

    toggleTheme() {
        const currentTheme = this.app.className.includes('light') ? 'light' : 'dark';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    }

    handleSubredditChange() {
        let input = this.subredditInput.value.trim();
        
        // Check if the input looks like a multi-reddit
        const isMultiRedditInput = input.includes('user/') && input.includes('/m/');
        
        // Normalize multi-reddit format - ensure it starts with '/'
        if (isMultiRedditInput && !input.startsWith('/')) {
            input = '/' + input;
        }
        
        if (input && input !== this.currentSubreddit) {
            const wasEmpty = !this.currentSubreddit;
            this.currentSubreddit = input;
            
            // Get storage key for this input (subreddit name or multi-reddit path)
            const storageKey = this.getStorageKey(input);
            
            // Initialize hidden posts for this subreddit/multi-reddit if not already created
            if (!this.hiddenPosts[storageKey]) {
                this.hiddenPosts[storageKey] = new Set();
            }
            
            this.hasError = false; // Reset error state
            this.updateURL(); // Update URL
            this.showSubredditConfirmation(input);
            this.loadPosts();
            
            // Start timer if it wasn't running (first input entry)
            if (wasEmpty) {
                this.startRefreshTimer();
            } else {
                this.resetRefreshTimer();
            }
        }
    }

    showSubredditConfirmation(input) {
        // Create shockwave effect
        const inputRect = this.subredditInput.getBoundingClientRect();
        const shockwave = document.createElement('div');
        shockwave.className = 'shockwave';
        shockwave.style.position = 'fixed';
        shockwave.style.left = `${inputRect.left + inputRect.width / 2}px`;
        shockwave.style.top = `${inputRect.top + inputRect.height / 2}px`;
        shockwave.style.width = '4px';
        shockwave.style.height = '4px';
        shockwave.style.border = '2px solid var(--success)';
        shockwave.style.borderRadius = '50%';
        shockwave.style.pointerEvents = 'none';
        shockwave.style.zIndex = '1000';
        shockwave.style.transform = 'translate(-50%, -50%)';
        
        document.body.appendChild(shockwave);
        
        // Animate the shockwave
        shockwave.animate([
            { 
                width: '4px', 
                height: '4px', 
                opacity: '1',
                borderWidth: '2px'
            },
            { 
                width: `${this.SHOCKWAVE_SIZE}px`, 
                height: `${this.SHOCKWAVE_SIZE}px`, 
                opacity: '0',
                borderWidth: '1px'
            }
        ], {
            duration: 100,
            easing: 'ease-out'
        }).onfinish = () => {
            document.body.removeChild(shockwave);
        };
        
        // Add input border effect
        this.subredditInput.style.borderColor = 'var(--success)';
        this.subredditInput.style.boxShadow = '0 0 0 3px rgba(40, 167, 69, 0.2)';
        
        setTimeout(() => {
            this.subredditInput.style.borderColor = 'var(--border-color)';
            this.subredditInput.style.boxShadow = 'none';
        }, 100);
    }

    handleTabChange(sort) {
        if (sort !== this.currentSort) {
            this.currentSort = sort;
            this.updateActiveTab();
            this.updateURL(); // Update URL
            if (this.currentSubreddit) {
                this.loadPosts();
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
                
                if (this.currentTimer >= this.refreshTimer) {
                    if (this.currentSubreddit) {
                        this.loadPosts();
                    }
                    this.resetRefreshTimer();
                }
            } else {
                // Update display even in error state to show grayed out circle
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
            // Show grayed out circle when in error state
            this.timerProgress.style.strokeDashoffset = this.TIMER_CIRCUMFERENCE; // Empty circle
            this.timerProgress.style.opacity = '0.3'; // Grayed out
        } else {
            // Normal countdown behavior
            const progress = (this.currentTimer / this.refreshTimer) * this.TIMER_CIRCUMFERENCE;
            const offset = this.TIMER_CIRCUMFERENCE - progress;
            this.timerProgress.style.strokeDashoffset = offset;
            this.timerProgress.style.opacity = '1'; // Full opacity
        }
    }

    async loadPosts() {
        if (!this.currentSubreddit) return;

        this.isLoading = true;
        this.showLoading();
        this.hideError();
        this.hideInitialMessage();

        try {
            const url = this.getRedditApiUrl(this.currentSubreddit, this.currentSort);
            const response = await fetch(url);
            
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
            
            this.updatePosts(newPosts);
            this.hideLoading();
            this.isLoading = false;
            this.hasError = false;
            
            // Update favorite button state for successful subreddit load
            this.updateFavoriteButtonState();
            
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

    updatePosts(newPosts) {
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

        if (oldPosts.length === 0) {
            // First load
            this.renderPosts();
        } else {
            // Update with animations
            this.animatePostUpdates(oldPosts, newPosts);
        }
    }

    animatePostUpdates(oldPosts, newPosts) {
        const container = this.postsContainer;
        const oldPostsMap = new Map(oldPosts.map(post => [post.id, post]));
        const newPostsMap = new Map(newPosts.map(post => [post.id, post]));
        
        // Filter out hidden posts from both old and new posts for animation comparison
        const visibleOldPosts = oldPosts.filter(post => !this.isPostHidden(post.id));
        const visibleNewPosts = newPosts.filter(post => !this.isPostHidden(post.id));
        
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
                // New post - animate in
                postElement.classList.add('entering');
                setTimeout(() => {
                    postElement.classList.remove('entering');
                }, this.ANIMATION_DURATION);
            } else {
                // Existing post - check if position changed
                const oldIndex = visibleOldPosts.findIndex(p => p.id === post.id);
                if (oldIndex !== newIndex) {
                    if (oldIndex > newIndex) {
                        // Post moved up
                        postElement.classList.add('moving-up');
                        setTimeout(() => {
                            postElement.classList.remove('moving-up');
                        }, this.ANIMATION_DURATION);
                    } else {
                        // Post moved down
                        postElement.classList.add('moving-down');
                        setTimeout(() => {
                            postElement.classList.remove('moving-down');
                        }, this.ANIMATION_DURATION);
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
                        if (postElement.parentNode) {
                            postElement.parentNode.removeChild(postElement);
                        }
                    }, this.ANIMATION_DURATION);
                }
            }
        });
        
        // Replace old container with new one
        setTimeout(() => {
            container.parentNode.removeChild(container);
            tempContainer.id = 'posts-container';
            this.postsContainer = tempContainer;
        }, this.ANIMATION_DURATION + 100); // Slightly longer than animation duration
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
            const postElement = this.createPostElement(post);
            this.postsContainer.appendChild(postElement);
        });
    }

    createPostElement(post) {
        const postDiv = document.createElement('div');
        postDiv.className = 'post';
        postDiv.setAttribute('data-post-id', post.id);
        
        // Apply hidden class immediately to prevent flash
        if (this.isPostHidden(post.id)) {
            postDiv.classList.add('hidden');
        } else {
            // Add visible class for posts that should be shown
            postDiv.classList.add('visible');
        }
        
        // Create header row for the post (will hold hide button, votes, and subreddit)
        const postHeaderRow = document.createElement('div');
        postHeaderRow.className = 'post-header-row';
        
        // Create voting section to contain both hide button and votes for large screens
        const votingSection = document.createElement('div');
        votingSection.className = 'post-voting-section';
        
        // Create hide button - will be used in both layouts
        const hideButton = document.createElement('button');
        hideButton.className = 'hide-btn';
        hideButton.textContent = 'Hide';
        hideButton.onclick = () => this.hidePost(post.id);
        
        // Create a clone for the header row
        const hideButtonMobile = hideButton.cloneNode(true);
        hideButtonMobile.onclick = () => this.hidePost(post.id);
        
        // Create votes div - will be used in both layouts
        const votesDiv = document.createElement('div');
        votesDiv.className = 'post-votes';
        
        // Add an upvote icon
        const upvoteIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        upvoteIcon.setAttribute("width", "12");
        upvoteIcon.setAttribute("height", "12");
        upvoteIcon.setAttribute("viewBox", "0 0 24 24");
        upvoteIcon.setAttribute("class", "upvote-icon");
        upvoteIcon.innerHTML = `<path d="M12 4l8 8h-6v8h-4v-8H4z" fill="currentColor"/>`;
        
        const votesText = document.createElement('span');
        votesText.textContent = this.formatNumber(post.ups);
        
        votesDiv.appendChild(upvoteIcon);
        votesDiv.appendChild(votesText);
        
        // Clone for mobile view
        const votesDivMobile = votesDiv.cloneNode(true);
        
        // Create subreddit link
        const subredditLink = document.createElement('a');
        subredditLink.className = 'post-subreddit';
        const subredditName = post.subreddit_name_prefixed || `r/${post.subreddit}`;
        subredditLink.href = `https://reddit.com/${subredditName}`;
        subredditLink.textContent = subredditName;
        subredditLink.target = '_blank';
        
        // Clone for the content area (large screens)
        const subredditLinkDesktop = subredditLink.cloneNode(true);
        
        // Add elements to voting section for large screens
        votingSection.appendChild(hideButton);
        votingSection.appendChild(votesDiv);
        
        // Add elements to header row for small screens
        postHeaderRow.appendChild(hideButtonMobile);
        postHeaderRow.appendChild(votesDivMobile);
        postHeaderRow.appendChild(subredditLink);
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'post-content';
        
        // Add a class to differentiate post types for styling
        if (post.selftext && post.selftext.trim()) {
            contentDiv.classList.add('selftext-post');
        } else if (!post.is_self && post.domain && post.url_overridden_by_dest && !post.is_reddit_media_domain) {
            contentDiv.classList.add('external-post');
        }
        
        const titleLink = document.createElement('a');
        titleLink.className = 'post-title';
        titleLink.href = `https://reddit.com${post.permalink}`;
        titleLink.target = '_blank';
        titleLink.textContent = post.title;
        
        // Create metadata container for time and description
        const metadataDiv = document.createElement('div');
        metadataDiv.className = 'post-metadata';
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'post-time';
        timeSpan.textContent = this.formatTimeAgo(post.created_utc);
        metadataDiv.appendChild(timeSpan);
        
        let hasDescription = false;
        
        if (post.selftext && post.selftext.trim()) {
            // Add a separator between time and selftext
            const separator = document.createElement('span');
            separator.className = 'post-meta-separator';
            separator.textContent = '•';
            metadataDiv.appendChild(separator);
            
            // Posts with selftext - both title and description link to Reddit
            const descriptionLink = document.createElement('a');
            descriptionLink.href = `https://reddit.com${post.permalink}`;
            descriptionLink.target = '_blank';
            descriptionLink.textContent = post.selftext;
            descriptionLink.className = 'post-description-link selftext-link';
            metadataDiv.appendChild(descriptionLink);
            hasDescription = true;
        } else if (!post.is_self && post.domain && post.url_overridden_by_dest && !post.is_reddit_media_domain) {
            // Add a separator between time and domain
            const separator = document.createElement('span');
            separator.className = 'post-meta-separator';
            separator.textContent = '•';
            metadataDiv.appendChild(separator);
            
            // Posts linking to external articles - exclude Reddit-hosted media
            const domainLink = document.createElement('a');
            domainLink.href = post.url_overridden_by_dest;
            domainLink.target = '_blank';
            domainLink.textContent = post.domain;
            domainLink.className = 'post-description-link external-link';
            metadataDiv.appendChild(domainLink);
            hasDescription = true;
        }
        // Posts that are neither selftext nor external links (including Reddit videos, images, etc.) will have no description
        
        // Insert the desktop subreddit link to content for large screens
        contentDiv.insertBefore(subredditLinkDesktop, contentDiv.firstChild);
        contentDiv.appendChild(titleLink);
        contentDiv.appendChild(metadataDiv);
        
        // Create a content wrapper for small screens to control ordering
        const mobileContentWrapper = document.createElement('div');
        mobileContentWrapper.className = 'mobile-content-wrapper';
        
        // Append all elements to the post
        postDiv.appendChild(votingSection);  // For large screens
        postDiv.appendChild(contentDiv);     // For large screens
        
        // Create mobile content elements with proper event handling
        const mobileTitleLink = document.createElement('a');
        mobileTitleLink.className = 'post-title mobile-title';
        mobileTitleLink.href = `https://reddit.com${post.permalink}`;
        mobileTitleLink.target = '_blank';
        mobileTitleLink.textContent = post.title;
        
        // Clone metadata with proper event handling
        const mobileMetadataDiv = document.createElement('div');
        mobileMetadataDiv.className = 'post-metadata mobile-metadata';
        
        const mobileTimeSpan = document.createElement('span');
        mobileTimeSpan.className = 'post-time';
        mobileTimeSpan.textContent = this.formatTimeAgo(post.created_utc);
        mobileMetadataDiv.appendChild(mobileTimeSpan);
        
        // Add description link if exists
        if (hasDescription) {
            if (post.selftext && post.selftext.trim()) {
                // Add a separator between time and selftext
                const mobileSeparator = document.createElement('span');
                mobileSeparator.className = 'post-meta-separator';
                mobileSeparator.textContent = '•';
                mobileMetadataDiv.appendChild(mobileSeparator);
                
                const mobileDescLink = document.createElement('a');
                mobileDescLink.href = `https://reddit.com${post.permalink}`;
                mobileDescLink.target = '_blank';
                mobileDescLink.textContent = post.selftext;
                mobileDescLink.className = 'post-description-link selftext-link';
                mobileMetadataDiv.appendChild(mobileDescLink);
            } else if (!post.is_self && post.domain && post.url_overridden_by_dest && !post.is_reddit_media_domain) {
                // Add a separator between time and domain
                const mobileSeparator = document.createElement('span');
                mobileSeparator.className = 'post-meta-separator';
                mobileSeparator.textContent = '•';
                mobileMetadataDiv.appendChild(mobileSeparator);
                
                const mobileDomainLink = document.createElement('a');
                mobileDomainLink.href = post.url_overridden_by_dest;
                mobileDomainLink.target = '_blank';
                mobileDomainLink.textContent = post.domain;
                mobileDomainLink.className = 'post-description-link external-link';
                mobileMetadataDiv.appendChild(mobileDomainLink);
            }
        }
        
        // For small screens, first the header row then the content
        mobileContentWrapper.appendChild(postHeaderRow);  // Header row first on mobile
        mobileContentWrapper.appendChild(mobileTitleLink); // Then the title
        mobileContentWrapper.appendChild(mobileMetadataDiv); // Then metadata
        
        postDiv.appendChild(mobileContentWrapper);  // Add mobile wrapper to post
        
        return postDiv;
    }

    hidePost(postId) {
        // If we have a current subreddit/multi-reddit, add the post to its hidden list for current tab
        if (this.currentSubreddit) {
            const storageKey = this.getStorageKey(this.currentSubreddit);
            
            // Initialize nested structure if not exists
            if (!this.hiddenPosts[storageKey]) {
                this.hiddenPosts[storageKey] = {};
            }
            if (!this.hiddenPosts[storageKey][this.currentSort]) {
                this.hiddenPosts[storageKey][this.currentSort] = new Set();
            }
            
            this.hiddenPosts[storageKey][this.currentSort].add(postId);
            
            // Save to localStorage after hiding a post
            this.saveHiddenPostsToStorage();
        }
        
        // Find and hide all elements with this post ID (in case it appears multiple times)
        const postElements = document.querySelectorAll(`[data-post-id="${postId}"]`);
        postElements.forEach(postElement => {
            postElement.classList.remove('visible');
            postElement.classList.add('hiding');
            // After animation completes, remove from DOM
            setTimeout(() => {
                if (postElement.parentNode) {
                    postElement.parentNode.removeChild(postElement);
                }
            }, 220); // 200ms animation + 20ms buffer
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

    showError(errorType = 'GENERIC') {
        this.hideInitialMessage();
        
        const errorMessage = document.createElement('div');
        errorMessage.id = 'error-message';
        errorMessage.className = 'error-message';
        
        let title, message, suggestion;
        
        if (errorType === 'NO_POSTS') {
            title = 'No Posts Found';
            
            if (this.isMultiReddit(this.currentSubreddit)) {
                message = `The multi-reddit "${this.currentSubreddit}" exists but has no posts in the "${this.currentSort}" category.`;
            } else {
                message = `The subreddit "${this.currentSubreddit}" exists but has no posts in the "${this.currentSort}" category.`;
            }
            
            suggestion = `
                <p class="error-suggestion">Try switching to a different tab (Hot, New, etc.) or check back later.</p>
            `;
        } else {
            // Generic error for all other cases (FETCH_ERROR, network issues, etc.)
            title = 'Unable to Load Posts';
            
            if (this.isMultiReddit(this.currentSubreddit)) {
                message = `Could not load posts from multi-reddit "${this.currentSubreddit}".`;
                suggestion = `
                    <p class="error-suggestion">Please double-check the multi-reddit path and try again.</p>
                    <p class="error-suggestion">
                        You can verify it exists by visiting: 
                        <a href="https://www.reddit.com${this.currentSubreddit}" target="_blank" rel="noopener">
                            reddit.com${this.currentSubreddit}
                        </a>
                    </p>
                    <p class="error-suggestion">
                        This could also be due to network issues or Reddit being temporarily unavailable.
                        Check the <a href="https://www.redditstatus.com" target="_blank" rel="noopener">Reddit Status Page</a> if the problem persists.
                    </p>
                `;
            } else {
                message = `Could not load posts from subreddit "${this.currentSubreddit}".`;
                suggestion = `
                    <p class="error-suggestion">Please double-check the subreddit name and try again.</p>
                    <p class="error-suggestion">
                        You can verify it exists by visiting: 
                        <a href="https://www.reddit.com/r/${this.currentSubreddit}" target="_blank" rel="noopener">
                            reddit.com/r/${this.currentSubreddit}
                        </a>
                    </p>
                    <p class="error-suggestion">
                        This could also be due to network issues or Reddit being temporarily unavailable.
                        Check the <a href="https://www.redditstatus.com" target="_blank" rel="noopener">Reddit Status Page</a> if the problem persists.
                    </p>
                `; 
            }
        }
        
        errorMessage.innerHTML = `
            <div class="error-message-content">
                <h2>${title}</h2>
                <p>${message}</p>
                ${suggestion}
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
            // Multi-reddit format: /user/username/m/multiname
            return `https://www.reddit.com${input}/${sort}.json?limit=50`;
        } else {
            // Regular subreddit
            return `https://www.reddit.com/r/${input}/${sort}.json?limit=50`;
        }
    }
    
    // Get the storage key for hidden posts (subreddit or multi-reddit path)
    getStorageKey(input) {
        return input;
    }

    // Load hidden posts from localStorage
    // Structure: { subreddit: { sort: [postIds] } }
    loadHiddenPostsFromStorage() {
        try {
            const storedHiddenPosts = localStorage.getItem('hiddenPosts');
            if (storedHiddenPosts) {
                const hiddenPostsObj = JSON.parse(storedHiddenPosts);
                
                // Convert to new nested structure with Sets
                for (const subreddit in hiddenPostsObj) {
                    const subredditData = hiddenPostsObj[subreddit];
                    
                    // Check if this is old format (array) or new format (object with sorts)
                    if (Array.isArray(subredditData)) {
                        // Old format: migrate to new format under 'hot' tab
                        this.hiddenPosts[subreddit] = {
                            hot: new Set(subredditData)
                        };
                    } else {
                        // New format: convert arrays to Sets
                        this.hiddenPosts[subreddit] = {};
                        for (const sort in subredditData) {
                            this.hiddenPosts[subreddit][sort] = new Set(subredditData[sort]);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error loading hidden posts from storage:', error);
            this.hiddenPosts = {};
        }
        
        if (!this.hiddenPosts || typeof this.hiddenPosts !== 'object') {
            this.hiddenPosts = {};
        }
    }
    
    // Save hidden posts to localStorage
    saveHiddenPostsToStorage() {
        try {
            const hiddenPostsObj = {};
            for (const subreddit in this.hiddenPosts) {
                hiddenPostsObj[subreddit] = {};
                for (const sort in this.hiddenPosts[subreddit]) {
                    hiddenPostsObj[subreddit][sort] = Array.from(this.hiddenPosts[subreddit][sort]);
                }
            }
            
            localStorage.setItem('hiddenPosts', JSON.stringify(hiddenPostsObj));
        } catch (error) {
            console.error('Error saving hidden posts to storage:', error);
        }
    }
    
    // Get hidden posts for current subreddit AND current sort tab
    getHiddenPostsForCurrentSubreddit() {
        if (!this.currentSubreddit) return new Set();
        
        const storageKey = this.getStorageKey(this.currentSubreddit);
        
        // Initialize nested structure if not exists
        if (!this.hiddenPosts[storageKey]) {
            this.hiddenPosts[storageKey] = {};
        }
        if (!this.hiddenPosts[storageKey][this.currentSort]) {
            this.hiddenPosts[storageKey][this.currentSort] = new Set();
        }
        
        return this.hiddenPosts[storageKey][this.currentSort];
    }
    
    // Check if post is hidden for current subreddit AND current sort tab only
    isPostHidden(postId) {
        if (!this.currentSubreddit) return false;
        
        const storageKey = this.getStorageKey(this.currentSubreddit);
        
        if (!this.hiddenPosts[storageKey]) return false;
        if (!this.hiddenPosts[storageKey][this.currentSort]) return false;
        
        return this.hiddenPosts[storageKey][this.currentSort].has(postId);
    }
    
    // Get all hidden post IDs across all tabs for a subreddit
    getAllHiddenPostIdsForSubreddit(subreddit = null) {
        const targetSubreddit = subreddit || this.currentSubreddit;
        if (!targetSubreddit) return new Set();
        
        const storageKey = this.getStorageKey(targetSubreddit);
        if (!this.hiddenPosts[storageKey]) return new Set();
        
        const allHiddenIds = new Set();
        for (const sort in this.hiddenPosts[storageKey]) {
            for (const postId of this.hiddenPosts[storageKey][sort]) {
                allHiddenIds.add(postId);
            }
        }
        return allHiddenIds;
    }
    
    // Sync hidden posts from other tabs to current tab based on API response
    syncHiddenPostsFromOtherTabs(newPosts) {
        if (!this.currentSubreddit) return;
        
        const storageKey = this.getStorageKey(this.currentSubreddit);
        const currentPostIds = new Set(newPosts.map(post => post.id));
        
        // Get all hidden posts from OTHER tabs (not current tab)
        const hiddenFromOtherTabs = new Set();
        if (this.hiddenPosts[storageKey]) {
            for (const sort in this.hiddenPosts[storageKey]) {
                if (sort !== this.currentSort) {
                    for (const postId of this.hiddenPosts[storageKey][sort]) {
                        hiddenFromOtherTabs.add(postId);
                    }
                }
            }
        }
        
        // For any post hidden in other tabs that appears in current API response,
        // add it to current tab's hidden list
        let addedAny = false;
        const currentTabHidden = this.getHiddenPostsForCurrentSubreddit();
        
        for (const postId of hiddenFromOtherTabs) {
            if (currentPostIds.has(postId) && !currentTabHidden.has(postId)) {
                currentTabHidden.add(postId);
                addedAny = true;
            }
        }
        
        if (addedAny) {
            this.saveHiddenPostsToStorage();
        }
    }
    
    // Get count of hidden posts for current subreddit and tab
    getHiddenPostsCount(subreddit = null) {
        const targetSubreddit = subreddit || this.currentSubreddit;
        if (!targetSubreddit) return 0;
        
        const storageKey = this.getStorageKey(targetSubreddit);
        if (!this.hiddenPosts[storageKey]) return 0;
        if (!this.hiddenPosts[storageKey][this.currentSort]) return 0;
        
        return this.hiddenPosts[storageKey][this.currentSort].size;
    }
    
    // Get total count of hidden posts across all subreddits and tabs
    getTotalHiddenPostsCount() {
        let total = 0;
        for (const subreddit in this.hiddenPosts) {
            for (const sort in this.hiddenPosts[subreddit]) {
                total += this.hiddenPosts[subreddit][sort].size;
            }
        }
        return total;
    }
    
    // Purge all hidden posts from memory and localStorage
    purgeHiddenPosts() {
        // Clear the hidden posts from memory
        this.hiddenPosts = {};
        
        // Save the empty hidden posts to localStorage
        this.saveHiddenPostsToStorage();
        
        // Note: We intentionally do NOT clear favorites here
        
        // Show confirmation message
        this.showHiddenPostsPurgeConfirmation();
        
        // Refresh posts to show previously hidden ones
        if (this.currentSubreddit) {
            this.loadPosts();
        }
    }
    
    // Show a confirmation message when hidden posts are purged
    showHiddenPostsPurgeConfirmation() {
        const notification = document.createElement('div');
        notification.className = 'notification success-notification';
        notification.textContent = 'All hidden posts have been restored';
        
        // Add to body
        document.body.appendChild(notification);
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            notification.classList.add('fading-out');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 500);
        }, 3000);
    }

    // Initialize favorites
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
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.redditFeedReader = new RedditFeedReader();
});
