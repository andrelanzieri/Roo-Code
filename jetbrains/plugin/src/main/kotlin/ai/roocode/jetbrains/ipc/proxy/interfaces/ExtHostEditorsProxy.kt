// SPDX-FileCopyrightText: 2025 Weibo, Inc.
//
// SPDX-License-Identifier: Apache-2.0

package ai.roocode.jetbrains.ipc.proxy.interfaces

import ai.roocode.jetbrains.editor.EditorPropertiesChangeData
import ai.roocode.jetbrains.editor.TextEditorDiffInformation


interface ExtHostEditorsProxy {
    fun acceptEditorPropertiesChanged(id: String, props: EditorPropertiesChangeData)
    fun acceptEditorPositionData(data: Map<String , Int>)
    fun acceptEditorDiffInformation(id: String, diffInformation: List<TextEditorDiffInformation>?)
}