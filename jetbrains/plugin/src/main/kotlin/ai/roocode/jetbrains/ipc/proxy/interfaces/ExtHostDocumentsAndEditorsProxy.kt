// SPDX-FileCopyrightText: 2025 Weibo, Inc.
//
// SPDX-License-Identifier: Apache-2.0

package ai.roocode.jetbrains.ipc.proxy.interfaces

import ai.roocode.jetbrains.editor.DocumentsAndEditorsDelta


interface ExtHostDocumentsAndEditorsProxy {
    fun acceptDocumentsAndEditorsDelta(d: DocumentsAndEditorsDelta)
}