// frontend/src/components/SearchBar.js
import React, { useState } from 'react';

function SearchBar({ onSearch, defaultDepth = 1 }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [depth, setDepth] = useState(defaultDepth);

    const handleChange = (event) => {
        setSearchTerm(event.target.value);
    };

    const handleDepthChange = (e) => setDepth(Number(e.target.value));

    const handleSubmit = (event) => {
        event.preventDefault();
        onSearch(searchTerm, depth);
    };

    return (
        <form onSubmit={handleSubmit} className="search-row" style={{display: 'flex', gap: 8, alignItems: 'center'}}>
            <input
                type="text"
                placeholder="按诗题/作者/正文检索（可输入数字 ID 以跳转节点）"
                value={searchTerm}
                onChange={handleChange}
                style={{flex: '0 0 420px'}}
            />


            <button type="submit">Search</button>
        </form>
    );
}

export default SearchBar;