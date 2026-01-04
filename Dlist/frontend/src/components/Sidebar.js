// frontend/src/components/Sidebar.js
import React from 'react';

function Sidebar({ description, metadata }) {
    return (
        <div className="sidebar">
            <h3>Description</h3>
            <p>{description || 'No description available.'}</p>
            <h3>Metadata</h3>
            <ul>
                {metadata && Object.entries(metadata).map(([key, value]) => (
                    <li key={key}>
                        <strong>{key}:</strong> {value}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default Sidebar;