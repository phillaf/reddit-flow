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
        this.hiddenPosts = new Set();
        this.refreshInterval = null;
        this.timerInterval = null;
        this.refreshTimer = this.REFRESH_INTERVAL;
        this.currentTimer = 0;
        this.isLoading = false;
        this.hasError = false;
        
        this.initializeElements();
        this.bindEvents();
        this.initializeTheme();
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
        } else {
            // No valid subreddit in URL, reset to defaults
            this.currentSubreddit = '';
            this.currentSort = 'hot';
            this.subredditInput.value = '';
            this.updateActiveTab();
        }
    }

    updateURL() {
        if (this.currentSubreddit) {
            const newPath = `/r/${this.currentSubreddit}${this.currentSort !== 'hot' ? '/' + this.currentSort : ''}`;
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
        this.app.className = `${theme}-theme`;
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
        const subreddit = this.subredditInput.value.trim();
        if (subreddit && subreddit !== this.currentSubreddit) {
            const wasEmpty = !this.currentSubreddit;
            this.currentSubreddit = subreddit;
            this.hiddenPosts.clear(); // Clear hidden posts when changing subreddit
            this.hasError = false; // Reset error state
            this.updateURL(); // Update URL
            this.showSubredditConfirmation(subreddit);
            this.loadPosts();
            
            // Start timer if it wasn't running (first subreddit entry)
            if (wasEmpty) {
                this.startRefreshTimer();
            } else {
                this.resetRefreshTimer();
            }
        }
    }

    showSubredditConfirmation(subreddit) {
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
            const url = `https://www.reddit.com/r/${this.currentSubreddit}/${this.currentSort}.json?limit=50`;
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
            
        } catch (error) {
            console.error('Failed to load posts:', error);
            this.showError(error.message);
            this.hideLoading();
            this.isLoading = false;
            this.hasError = true;
        }
    }

    updatePosts(newPosts) {
        const oldPosts = [...this.posts];
        this.posts = newPosts;
        
        // Clean up hidden posts that are no longer in the API response
        const currentPostIds = new Set(newPosts.map(post => post.id));
        const hiddenPostsArray = Array.from(this.hiddenPosts);
        hiddenPostsArray.forEach(postId => {
            if (!currentPostIds.has(postId)) {
                this.hiddenPosts.delete(postId);
            }
        });

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
        
        // Create a temporary container for animations
        const tempContainer = document.createElement('div');
        tempContainer.className = 'posts-container';
        container.parentNode.insertBefore(tempContainer, container);
        
        // Process each new post
        newPosts.forEach((post, newIndex) => {
            const postElement = this.createPostElement(post);
            
            if (!oldPostsMap.has(post.id)) {
                // New post - animate in
                postElement.classList.add('entering');
                setTimeout(() => {
                    postElement.classList.remove('entering');
                }, this.ANIMATION_DURATION);
            } else {
                // Existing post - check if position changed
                const oldIndex = oldPosts.findIndex(p => p.id === post.id);
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
        
        // Remove old posts that are no longer in the API
        oldPosts.forEach(post => {
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
            const postElement = this.createPostElement(post);
            this.postsContainer.appendChild(postElement);
        });
    }

    createPostElement(post) {
        const postDiv = document.createElement('div');
        postDiv.className = 'post';
        postDiv.setAttribute('data-post-id', post.id);
        
        if (this.hiddenPosts.has(post.id)) {
            postDiv.classList.add('hidden');
        }
        
        const hideButton = document.createElement('button');
        hideButton.className = 'hide-btn';
        hideButton.textContent = 'Hide';
        hideButton.onclick = () => this.hidePost(post.id);
        
        const votesDiv = document.createElement('div');
        votesDiv.className = 'post-votes';
        votesDiv.textContent = this.formatNumber(post.ups);
        
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
        
        const descriptionElement = document.createElement('div');
        descriptionElement.className = 'post-description';
        
        let hasDescription = false;
        
        if (post.selftext && post.selftext.trim()) {
            // Posts with selftext - both title and description link to Reddit
            const descriptionLink = document.createElement('a');
            descriptionLink.href = `https://reddit.com${post.permalink}`;
            descriptionLink.target = '_blank';
            descriptionLink.textContent = post.selftext;
            descriptionLink.className = 'post-description-link selftext-link';
            descriptionElement.appendChild(descriptionLink);
            hasDescription = true;
        } else if (!post.is_self && post.domain && post.url_overridden_by_dest && !post.is_reddit_media_domain) {
            // Posts linking to external articles - exclude Reddit-hosted media
            const domainLink = document.createElement('a');
            domainLink.href = post.url_overridden_by_dest;
            domainLink.target = '_blank';
            domainLink.textContent = post.domain;
            domainLink.className = 'post-description-link external-link';
            descriptionElement.appendChild(domainLink);
            hasDescription = true;
        }
        // Posts that are neither selftext nor external links (including Reddit videos, images, etc.) will have no description
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'post-time';
        timeDiv.textContent = this.formatTimeAgo(post.created_utc);
        
        contentDiv.appendChild(titleLink);
        if (hasDescription) {
            contentDiv.appendChild(descriptionElement);
        }
        
        postDiv.appendChild(hideButton);
        postDiv.appendChild(votesDiv);
        postDiv.appendChild(contentDiv);
        postDiv.appendChild(timeDiv);
        
        return postDiv;
    }

    hidePost(postId) {
        this.hiddenPosts.add(postId);
        const postElement = this.findPostElement(postId);
        if (postElement) {
            postElement.classList.add('hiding');
            // After animation completes, set to hidden
            setTimeout(() => {
                if (postElement.parentNode) {
                    postElement.parentNode.removeChild(postElement);
                }
            }, 220); // 200ms animation + 20ms buffer
        }
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
            message = `The subreddit "${this.currentSubreddit}" exists but has no posts in the "${this.currentSort}" category.`;
            suggestion = `
                <p class="error-suggestion">Try switching to a different tab (Hot, New, etc.) or check back later.</p>
            `;
        } else {
            // Generic error for all other cases (FETCH_ERROR, network issues, etc.)
            title = 'Unable to Load Posts';
            message = `Could not load posts from "${this.currentSubreddit}".`;
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
                    <p>Enter a subreddit name to display posts</p>
                    <p class="example">e.g., worldnews, technology, programming</p>
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
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.redditFeedReader = new RedditFeedReader();
});
