/**
 * Validates that a plugin name is in kebab-case format
 * @param name - The plugin name to validate
 * @returns true if valid, error message if invalid
 */
export function validatePluginName(name: string): true | string {
    if (!name || name.trim().length === 0) {
        return 'Plugin name is required';
    }

    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
        return 'Plugin name must be lowercase kebab-case (e.g., discord, twilio-sms)';
    }

    if (name.startsWith('plugin-')) {
        return 'Plugin name should not include "plugin-" prefix';
    }

    return true;
}

/**
 * Validates that a channel identifier is valid
 * @param channel - The channel identifier to validate
 * @returns true if valid, error message if invalid
 */
export function validateChannel(channel: string): true | string {
    if (!channel || channel.trim().length === 0) {
        return 'Channel identifier is required';
    }

    if (!/^[a-z][a-z0-9]*$/.test(channel)) {
        return 'Channel must be lowercase alphanumeric (e.g., discord, sms)';
    }

    return true;
}

/**
 * Validates that a description meets minimum length
 * @param description - The description to validate
 * @returns true if valid, error message if invalid
 */
export function validateDescription(description: string): true | string {
    if (!description || description.trim().length === 0) {
        return 'Description is required';
    }

    if (description.trim().length < 10) {
        return 'Description must be at least 10 characters';
    }

    return true;
}

/**
 * Validates that an email is in valid format (optional field)
 * @param email - The email to validate
 * @returns true if valid or empty, error message if invalid
 */
export function validateEmail(email: string): true | string {
    if (!email || email.trim().length === 0) {
        return true; // Email is optional
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return 'Please enter a valid email address';
    }

    return true;
}

/**
 * Validates that author name is not empty
 * @param author - The author name to validate
 * @returns true if valid, error message if invalid
 */
export function validateAuthor(author: string): true | string {
    if (!author || author.trim().length === 0) {
        return 'Author name is required';
    }

    return true;
}
